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
  async analyzeRepo(
    @Arg("githubUsername") githubUsername: string,
    @Arg("repoName") repoName: string,
    @Arg("branchName", { nullable: true }) branchName?: string
  ): Promise<SonarIssue[]> {
    console.log(`analyzeRepo called with username: ${githubUsername}, repo: ${repoName}, branch: ${branchName}`);
    try {
      
      const user = await this.userRepo.findOne({ where: { username: githubUsername } });
      if (!user) throw new Error(`User ${githubUsername} not found`);
      const projectKey = repoName.replace(/[^a-zA-Z0-9_-]/g, "_");
      console.log(`Generated project key: ${projectKey}`);
      const existingProjectResponse = await fetch(
        `${SONARQUBE_API_URL}/api/projects/search?projects=${projectKey}`,
        {
          method: "GET",
          headers: { Authorization: `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}` },
        }
      );
      const existingProjectData = await existingProjectResponse.json();
      const projectExists = existingProjectData.components?.length > 0;

      if (!projectExists) {
        console.log(`Creating new SonarQube project: ${projectKey}`);

        const createProjectResponse = await fetch(`${SONARQUBE_API_URL}/api/projects/create`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            name: repoName,
            project: projectKey,
          }).toString(),
        });

        if (!createProjectResponse.ok) {
          const errorText = await createProjectResponse.text();
          throw new Error(`Failed to create SonarQube project: ${errorText}`);
        }

        console.log(`SonarQube project ${projectKey} created successfully`);
      }
      let project = await this.projectRepo.findOne({ where: { repoName: projectKey } });
      if (!project) {
        project = this.projectRepo.create({
          title: repoName,
          repoName: projectKey,
          description: `Automatically created SonarQube project for ${repoName}`,
          overview: "Auto-generated",
          result: "Pending",
          user,
          username: user.username,
        });
        await this.projectRepo.save(project);
      }
      console.log(`Starting SonarQube analysis for ${projectKey} on branch ${branchName || "main"}`);
      const analysisResponse = await fetch(
        `${SONARQUBE_API_URL}/api/ce/submit`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            projectKey,
            branch: branchName || "main",
            report:"true"
          }).toString(),
        }
      );

      const analysisData = await analysisResponse.json();
      if (!analysisResponse.ok || !analysisData.taskId) {
        throw new Error(`Failed to start SonarQube analysis: ${JSON.stringify(analysisData)}`);
      }

      console.log(`Analysis started with Task ID: ${analysisData.taskId}`);
      let status = "PENDING";
      let attempts = 0;
      while (status === "PENDING" || status === "IN_PROGRESS") {
        if (attempts >= 12) {
          throw new Error("Analysis timeout exceeded (60 seconds)");
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;

        const taskResponse = await fetch(
          `${SONARQUBE_API_URL}/api/ce/task?id=${analysisData.taskId}`,
          {
            method: "GET",
            headers: { Authorization: `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}` },
          }
        );

        const taskData = await taskResponse.json();
        status = taskData.task?.status;
        console.log(`Status: ${status} (Attempt ${attempts})`);
      }

      if (status !== "SUCCESS") {
        project.result = `Analysis failed: ${status}`;
        await this.projectRepo.save(project);
        throw new Error(`SonarQube analysis failed with status: ${status}`);
      }

     
      console.log(`Fetching issues for ${projectKey}...`);
      const issuesResponse = await fetch(
        `${SONARQUBE_API_URL}/api/issues/search?componentKeys=${projectKey}&statuses=OPEN,CONFIRMED,REOPENED,RESOLVED&ps=500`,
        {
          method: "GET",
          headers: {
            Authorization: `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}` },
        }
      ); 

      const sonarData = await issuesResponse.json();
      if (!sonarData.issues) {
        throw new Error(`No issues found.`);
      }

      await this.sonarIssueRepo.delete({ project: { u_id: project.u_id } });

      const issuesToSave = sonarData.issues.map((issue: any) =>
        this.sonarIssueRepo.create({
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
          textRange: JSON.stringify(issue.textRange),
          flows: JSON.stringify(issue.flows),
          project,
        })
      );

      await this.sonarIssueRepo.save(issuesToSave);
      project.result = "Analysis completed successfully";
      await this.projectRepo.save(project);

      console.log(`Analysis completed for ${projectKey}`);
      return this.sonarIssueRepo.find({ where: { project: { u_id: project.u_id } }, order: { severity: "DESC" } });
    } catch (error) {
      console.error(`Error in analyzeRepo:`, error);
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }
}
