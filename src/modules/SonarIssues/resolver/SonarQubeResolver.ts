import { Resolver, Query, Arg } from "type-graphql";
import { SonarIssue } from "../entity/sonarIssue.entity";
import { Project } from "../../Project/entity/project.entity";
import dataSource from "../../../database/data-source";
import { User } from "../../user/entity/user.entity";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const SONARQUBE_API_URL = process.env.SONARQUBE_API_URL;
const SONARQUBE_API_TOKEN = process.env.SONARQUBE_API_TOKEN;

@Resolver()
export class SonarQubeResolver {
  private sonarIssueRepo = dataSource.getRepository(SonarIssue);
  private projectRepo = dataSource.getRepository(Project);
  private userRepo = dataSource.getRepository(User);

  @Query(() => [SonarIssue])
  async getSonarIssues(
    @Arg("githubUsername") githubUsername: string,
    @Arg("repoName") repoName: string
  ): Promise<SonarIssue[]> {
    try {
      console.log(`Fetching SonarQube issues for ${githubUsername}/${repoName}`);

      const user = await this.userRepo.findOne({ where: { username: githubUsername } });
      if (!user) {
        throw new Error(`User ${githubUsername} not found`);
      }

      let project = await this.projectRepo.findOne({
        where: { title: repoName, user: { u_id: user.u_id } },
        relations: ["user"],
      });

      if (!project) {
        console.log(`Creating SonarQube project for ${repoName}`);
        const createProjectResponse = await fetch(
          `${SONARQUBE_API_URL}/api/projects/create`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: repoName,
              project: repoName.replace(/[^a-zA-Z0-9_-]/g, "_"),
            }),
          }
        );

        const createProjectData = await createProjectResponse.json();
        if (!createProjectResponse.ok) {
          throw new Error(`Failed to create SonarQube project: ${JSON.stringify(createProjectData)}`);
        }

        project = this.projectRepo.create({
          title: repoName,
          repoName: repoName,
          description: `Auto-created project for ${repoName}`,
          overview: "Automatically generated overview",
          result: "Pending",
          user,
          username: user.username,
        });
        await this.projectRepo.save(project);
      }

      console.log(`Triggering SonarQube analysis for ${repoName}`);
      const analysisResponse = await fetch(
        `${SONARQUBE_API_URL}/api/ce/submit`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectKey: repoName.replace(/[^a-zA-Z0-9_-]/g, "_"),
            name: `${repoName}-analysis`,
          }),
        }
      );

      const analysisData = await analysisResponse.json();
      if (!analysisResponse.ok) {
        throw new Error(`Failed to trigger analysis: ${JSON.stringify(analysisData)}`);
      }

      const issuesResponse = await fetch(
        `${SONARQUBE_API_URL}/api/issues/search?componentKeys=${repoName.replace(
          /[^a-zA-Z0-9_-]/g,
          "_"
        )}&statuses=OPEN,CONFIRMED,REOPENED,RESOLVED&ps=500`,
        {
          method: "GET",
          headers: {
            Authorization: `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!issuesResponse.ok) {
        const errorText = await issuesResponse.text();
        throw new Error(`SonarQube API request failed: ${errorText}`);
      }

      const sonarData = await issuesResponse.json();
      if (!sonarData.issues) {
        throw new Error("No issues array in SonarQube response");
      }

      await this.sonarIssueRepo.delete({ project: { u_id: project.u_id } });

      const issuesToSave = sonarData.issues.map((issue: any) => {
        return this.sonarIssueRepo.create({
          type: issue.type,
          severity: issue.severity,
          message: issue.message,
          rule: issue.rule,
          component: issue.component,
          line: issue.line,
          effort: issue.effort,
          debt: issue.debt,
          author: issue.author,
          status: issue.status,
          resolution: issue.resolution,
          hash: issue.hash,
          textRange: issue.textRange ? JSON.stringify(issue.textRange) : undefined,
          flows: issue.flows ? JSON.stringify(issue.flows) : undefined,
          project,
        });
      });

      await this.sonarIssueRepo.save(issuesToSave);

      return this.sonarIssueRepo.find({
        where: { project: { u_id: project.u_id } },
        order: { severity: "DESC", type: "ASC" },
        relations: ["project"],
      });
    } catch (error) {
      console.error("Error in getSonarIssues:", error);
      throw new Error("Failed to fetch SonarQube issues.");
    }
  }
}
