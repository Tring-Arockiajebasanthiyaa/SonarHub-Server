import { Resolver, Query, Mutation, Arg } from "type-graphql";
import { SonarIssue } from "../entity/SonarIssue.entity";
import { Project } from "../../Project/entity/project.entity";
import dataSource from "../../../database/data-source";
import { User } from "../../../modules/user/entity/user.entity";
import { SonarIssueInput } from "../entity/SonarIssueInput";
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

      let project = await this.projectRepo.findOne({
        where: { title: repoName },
        relations: ["user", "sonarIssues"],
      });

      if (!project) {
        const user = await this.userRepo.findOne({ where: { username: githubUsername } });
        if (!user) throw new Error(`User not found for username: ${githubUsername}`);

        project = this.projectRepo.create({
          title: repoName,
          description: `Auto-created project for ${repoName}`,
          overview: "Automatically generated overview",
          result: "Pending",
          user,
        });

        await this.projectRepo.save(project);
      }

      const response = await fetch(
        `${SONARQUBE_API_URL}/api/issues/search?componentKeys=${repoName}`,
        {
          method: "GET",
          headers: {
            Authorization: `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("response",response);
      if (!response.ok) {
        console.error(`SonarQube API request failed: ${response.statusText}`);
        throw new Error(`Failed to fetch SonarQube issues.`);
      }

      const sonarData = await response.json();
      console.log("Sonardata",sonarData);
      if (!sonarData.issues) throw new Error("Invalid response from SonarQube API.");

      const sonarIssues = sonarData.issues.map((issue: any) =>
        this.sonarIssueRepo.create({
          issueType: issue.type,
          severity: issue.severity,
          message: issue.message,
          rule: issue.rule,
          component: issue.component,
          project,
        })
      );

      await this.sonarIssueRepo.save(sonarIssues);

      return this.sonarIssueRepo.find({ where: { project: { u_id: project.u_id } } });
    } catch (error) {
      console.error("Error in getSonarIssues:", error);
      throw new Error("Failed to fetch SonarQube issues.");
    }
  }

  @Mutation(() => Boolean)
  async addSonarIssues(
    @Arg("repoName") repoName: string,
    @Arg("githubUsername") githubUsername: string,
    @Arg("issues", () => [SonarIssueInput]) issues: SonarIssueInput[]
  ): Promise<boolean> {
    try {
      const project = await this.projectRepo.findOne({
        where: { title: repoName },
        relations: ["user"],
      });

      if (!project) throw new Error("Project not found!");

      const sonarIssues = issues.map((issue) =>
        this.sonarIssueRepo.create({ ...issue, project })
      );

      await this.sonarIssueRepo.save(sonarIssues);
      return true;
    } catch (error) {
      console.error("Error in addSonarIssues:", error);
      throw new Error("Failed to add SonarQube issues.");
    }
  }
}
