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
        project = this.projectRepo.create({
          title: repoName,
          description: `Auto-created project for ${repoName}`,
          overview: "Automatically generated overview",
          result: "Pending",
          user,
        });
        await this.projectRepo.save(project);
      }

      const projectCheckResponse = await fetch(
        `${SONARQUBE_API_URL}/api/components/show?component=${repoName}`,
        {
          method: "GET",
          headers: {
            Authorization: `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}`,
            "Content-Type": "application/json",
          },
        }
      );

      const projectData = await projectCheckResponse.json();
      console.log("SonarQube Project Data:", projectData);

      if (!projectData.component) {
        throw new Error(`SonarQube project ${repoName} not found`);
      }

     
      const issuesResponse = await fetch(
        `${SONARQUBE_API_URL}/api/issues/search?componentKeys=${projectData.component.key}&statuses=OPEN,CONFIRMED,REOPENED,RESOLVED&ps=500`,
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
      console.log("SonarQube response data:", sonarData);

      if (!sonarData.issues) {
        throw new Error("No issues array in SonarQube response");
      }

      
      await this.sonarIssueRepo.delete({ project: { u_id: project.u_id } });

      const issuesToSave = sonarData.issues.map((issue: any) => {
        const newIssue = new SonarIssue();
        newIssue.type = issue.type;
        newIssue.severity = issue.severity;
        newIssue.message = issue.message;
        newIssue.rule = issue.rule;
        newIssue.component = issue.component;
        newIssue.line = issue.line;
        newIssue.effort = issue.effort;
        newIssue.debt = issue.debt;
        newIssue.author = issue.author;
        newIssue.status = issue.status;
        newIssue.resolution = issue.resolution;
        newIssue.hash = issue.hash;
        newIssue.textRange = issue.textRange ? JSON.stringify(issue.textRange) : undefined;
        newIssue.flows = issue.flows ? JSON.stringify(issue.flows) : undefined;
        newIssue.project = project;
        return newIssue;
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
