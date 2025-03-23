import { Resolver, Query, Arg, Mutation } from "type-graphql";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { Project } from "../../Project/entity/project.entity";
import { Repository } from "typeorm";
import dataSource from "../../../database/data-source";
import { User } from "../../user/entity/user.entity";
dotenv.config();

@Resolver()
export class SonarQubeResolver {
  private API_URL = process.env.SONARQUBE_API_URL || "";
  private API_TOKEN = process.env.SONARQUBE_API_TOKEN || "";

  @Query(() => Project, { nullable: true })
  async getSonarQubeAnalysis(@Arg("projectKey") projectKey: string): Promise<Project | null> {
    const projectRepository: Repository<Project> = dataSource.getRepository(Project);
    let project = await projectRepository.findOne({ where: { title: projectKey } });
    if (!project) {
      project = await this.fetchAndStoreSonarQubeAnalysis(projectKey);
    }
    return project;
  }

  @Mutation(() => Project)
  async fetchAndStoreSonarQubeAnalysis(@Arg("projectKey") projectKey: string): Promise<Project> {
    if (!this.API_URL || !this.API_TOKEN) {
      throw new Error("Missing SonarQube API configuration");
    }

    // Fetch issues from SonarQube
    const response = await fetch(`${this.API_URL}/api/issues/search?componentKeys=${projectKey}`, {
        headers: {
          Authorization: `Basic ${Buffer.from(this.API_TOKEN + ":").toString("base64")}`,
        },
      });
      console.log("SonarQube API Status:", response.status); // Log the status code
      console.log("SonarQube API Headers:", response.headers); 
    const data = await response.json();
    console.log("SonarQube API Response:", JSON.stringify(data, null, 2));
    

    if (!data.issues) {
      throw new Error("No issues found for the given project.");
    }

    // Filter issues by type
    const issues = JSON.stringify(data.issues.filter((issue: any) => issue.type === "BUG") || []);
    const codeSmells = JSON.stringify(data.issues.filter((issue: any) => issue.type === "CODE_SMELL") || []);
    const suggestions = JSON.stringify(data.issues.filter((issue: any) => issue.type === "VULNERABILITY") || []);

    const projectRepository = dataSource.getRepository(Project);
    let project = new Project();
    project.title = projectKey;
    project.description = `Analysis data for ${projectKey}`;
    project.issues = issues;
    project.codeSmells = codeSmells;
    project.suggestions = suggestions;

    await projectRepository.save(project);
    return project;
  }
}