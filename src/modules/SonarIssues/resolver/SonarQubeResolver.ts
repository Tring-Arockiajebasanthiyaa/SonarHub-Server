import { Resolver, Query, Arg, Mutation } from "type-graphql";
import { SonarIssue } from "../entity/sonarIssue.entity";
import { Project } from "../../Project/entity/project.entity";
import { User } from "../../user/entity/user.entity";
import { CodeMetrics } from "../../codeMetrics/entity/codeMetrics.entity";
import dataSource from "../../../database/data-source";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { AnalysisResult } from "../graphql/types/AnalysisResult";

dotenv.config();

const SONARQUBE_API_URL = process.env.SONARQUBE_API_URL;
const SONARQUBE_API_TOKEN = process.env.SONARQUBE_API_TOKEN;
const GITHUB_API_URL = process.env.GITHUB_API;

@Resolver()
export class SonarQubeResolver {
  private sonarIssueRepo = dataSource.getRepository(SonarIssue);
  private projectRepo = dataSource.getRepository(Project);
  private userRepo = dataSource.getRepository(User);
  private metricsRepo = dataSource.getRepository(CodeMetrics);

  @Query(() => Project, { nullable: true })
  async getProjectAnalysis(
    @Arg("githubUsername") githubUsername: string,
    @Arg("repoName") repoName: string
  ) {
    const projectKey = `${githubUsername}_${repoName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    
    const project = await this.projectRepo.findOne({
      where: { repoName: projectKey },
      relations: ["sonarIssues", "codeMetrics", "user"]
    });

    if (!project) {
      throw new Error(`Project "${repoName}" not found for user ${githubUsername}. It may not have been analyzed yet.`);
    }

    return project;
  }
  @Mutation(() => String)
async triggerAutomaticAnalysis(
  @Arg("githubUsername") githubUsername: string
): Promise<string> {
  try {
    const user = await this.userRepo.findOne({ 
      where: { username: githubUsername },
      select: ["u_id", "username", "githubAccessToken"]
    });
    
    if (!user) throw new Error(`User ${githubUsername} not found`);
    if (!user.githubAccessToken) {
      throw new Error(`GitHub access token not found for user ${githubUsername}`);
    }

    const reposResponse = await fetch(`${GITHUB_API_URL}/users/${githubUsername}/repos`, {
      headers: { Authorization: `Bearer ${user.githubAccessToken}` },
    });

    if (!reposResponse.ok) throw new Error("Failed to fetch repositories.");

    const repositories = await reposResponse.json();

    for (const repo of repositories) {
      await this.analyzeRepository(user, repo);
    }

    return `SonarQube analysis triggered for all repositories of ${githubUsername}`;
  } catch (error) {
    console.error(`[triggerAutomaticAnalysis] Error:`, error);
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}
  @Mutation(() => AnalysisResult)
  async analyzeSingleRepository(
    @Arg("githubUsername") githubUsername: string,
    @Arg("repoName") repoName: string
  ): Promise<AnalysisResult> {
    try {
      console.log(`Starting analysis for ${githubUsername}/${repoName}`);
      
      const user = await this.userRepo.findOne({ 
        where: { username: githubUsername },
        select: ["u_id", "username", "githubAccessToken"]
      });
      
      if (!user) {
        throw new Error(`User ${githubUsername} not found`);
      }
      if (!user.githubAccessToken) {
        throw new Error(`GitHub access token not found for user ${githubUsername}`);
      }

      console.log(`Fetching repository ${repoName} from GitHub...`);
      const repoResponse = await fetch(
        `${GITHUB_API_URL}/repos/${githubUsername}/${repoName}`,
        { 
          headers: { 
            Authorization: `Bearer ${user.githubAccessToken}`,
            Accept: "application/vnd.github.v3+json"
          } 
        }
      );

      if (!repoResponse.ok) {
        const errorData = await repoResponse.json();
        throw new Error(`GitHub API error: ${repoResponse.status} - ${errorData.message}`);
      }

      const repo = await repoResponse.json();
      console.log("Repository data:", repo);

      if (!repo.html_url || repo.html_url.includes('github.com/default')) {
        throw new Error(`Invalid repository URL received: ${repo.html_url}`);
      }

      await this.analyzeRepository(user, repo);

      return {
        success: true,
        message: `Successfully analyzed repository ${repoName}`
      };
    } catch (error: any) {
      console.error(`Analysis failed:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  private async analyzeRepository(user: User, repo: any) {
    const projectKey = `${user.username}_${repo.name}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    const authHeader = `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}`;

    let project = await this.projectRepo.findOne({ where: { repoName: projectKey } });

    if (!project) {
      project = this.projectRepo.create({
        title: repo.name,
        repoName: projectKey,
        description: repo.description || `Analysis for ${repo.name}`,
        githubUrl: repo.html_url,
        isPrivate: repo.private,
        defaultBranch: repo.default_branch,
        user,
        username: user.username,
      });
    } else {
      project.githubUrl = repo.html_url;
      project.isPrivate = repo.private;
      project.defaultBranch = repo.default_branch;
    }

    await this.projectRepo.save(project);
    console.log(`Saved project ${projectKey} with URL: ${repo.html_url}`);

    // Configure SonarQube to analyze the GitHub repository directly
    await this.configureSonarQubeProject(user, project, repo, authHeader);

    // Trigger the analysis in SonarQube
    await this.triggerSonarQubeAnalysis(project, authHeader);

    project.lastAnalysisDate = new Date();
    await this.projectRepo.save(project);
  }

  private async configureSonarQubeProject(
    user: User,
    project: Project,
    repo: any,
    authHeader: string
  ) {
    const projectKey = project.repoName;
    
    try {
      // Check if project exists in SonarQube
      const projectResponse = await fetch(
        `${SONARQUBE_API_URL}/api/projects/search?projects=${projectKey}`,
        { headers: { Authorization: authHeader } }
      );
  
      if (!projectResponse.ok) throw new Error(await projectResponse.text());
  
      const projectData = await projectResponse.json();
      
      if (projectData.components.length === 0) {
        // Create project in SonarQube if it doesn't exist
        const createResponse = await fetch(`${SONARQUBE_API_URL}/api/projects/create`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            name: repo.name,
            project: projectKey,
            visibility: "public",
          }).toString(),
        });
  
        if (!createResponse.ok) throw new Error(await createResponse.text());
      }
  
      // For newer versions, use the GitHub App integration or DevOps Platform integration
      const configResponse = await fetch(`${SONARQUBE_API_URL}/api/settings/set`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectKey,
          repositoryIdentifier: repo.full_name,
          devOpsPlatform: "github"
        }),
      });
  
      if (!configResponse.ok) {
        throw new Error(`Failed to configure GitHub integration: ${await configResponse.text()}`);
      }
  
    } catch (error) {
      console.error(`[configureSonarQubeProject] Error configuring ${repo.name}:`, error);
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }
  
  private async configureLegacyGithubIntegration(
    projectKey: string,
    repo: any,
    authHeader: string
  ) {
    // For older SonarQube versions, we'll configure the properties manually
    const propertiesToSet = [
      { key: 'sonar.projectKey', value: projectKey },
      { key: 'sonar.projectName', value: repo.name },
      { key: 'sonar.scm.provider', value: 'git' },
      { key: 'sonar.scm.url', value: repo.html_url },
      { key: 'sonar.links.scm', value: repo.html_url },
      { key: 'sonar.links.homepage', value: repo.html_url }
    ];
  
    for (const prop of propertiesToSet) {
      const response = await fetch(`${SONARQUBE_API_URL}/api/settings/set`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          key: prop.key,
          value: prop.value,
          component: projectKey
        }).toString(),
      });
  
      if (!response.ok) {
        console.error(`Failed to set property ${prop.key}:`, await response.text());
      }
    }
  }

  private async triggerSonarQubeAnalysis(
    project: Project,
    authHeader: string
  ) {
    try {
      // Trigger analysis via SonarQube API
      const analysisResponse = await fetch(
        `${SONARQUBE_API_URL}/api/project_analyses/search?project=${project.repoName}`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          project: project.repoName,
        }).toString(),
      });

      if (!analysisResponse.ok) throw new Error(await analysisResponse.text());

      const analysisData = await analysisResponse.json();
      const taskId = analysisData.task.id;

      // Wait for analysis to complete
      await this.waitForAnalysisCompletion(taskId, project, authHeader);

    } catch (error) {
      console.error(`[triggerSonarQubeAnalysis] Error triggering analysis:`, error);
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  private async waitForAnalysisCompletion(
    taskId: string,
    project: Project,
    authHeader: string
  ) {
    let status = "PENDING";
    let attempts = 0;
    const maxAttempts = 30;

    while (status === "PENDING" && attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 10000));

      const statusResponse = await fetch(
        `${SONARQUBE_API_URL}/api/ce/task?id=${taskId}`,
        { headers: { Authorization: authHeader } }
      );

      if (!statusResponse.ok) {
        console.error(`Failed to check analysis status for task ${taskId}`);
        continue;
      }

      const statusData = await statusResponse.json();
      status = statusData.task.status;
    }

    if (status === "SUCCESS") {
      await this.storeAnalysisResults(project, authHeader);
    } else {
      console.error(`Analysis failed or timed out for project ${project.repoName}`);
    }
  }

  private async storeAnalysisResults(
    project: Project,
    authHeader: string
  ) {
    try {
    
      const branchName = project.defaultBranch || 'main';
      const issuesResponse = await fetch(
        `${SONARQUBE_API_URL}/api/issues/search?componentKeys=${project.repoName}&resolved=false`,
        { headers: { Authorization: authHeader } }
      );

      if (!issuesResponse.ok) throw new Error(await issuesResponse.text());

      const issuesData = await issuesResponse.json();
      const issues = issuesData.issues.map((issue: any) => {
        const newIssue = new SonarIssue();
        newIssue.key = issue.key;
        newIssue.project = project;
        newIssue.type = issue.type;
        newIssue.severity = issue.severity;
        newIssue.message = issue.message;
        newIssue.rule = issue.rule;
        newIssue.component = issue.component;
        newIssue.line = issue.line;
        newIssue.status = issue.status;
        newIssue.resolution = issue.resolution;
        return newIssue;
      });

      // Save issues
      await this.sonarIssueRepo.save(issues);

      // Get code metrics for the default branch
      const metricsResponse = await fetch(
        `${SONARQUBE_API_URL}/api/measures/component?component=${project.repoName}&metricKeys=ncloc,coverage,duplicated_lines_density,violations,files,complexity`,
        { headers: { Authorization: authHeader } }
      );

      if (!metricsResponse.ok) throw new Error(await metricsResponse.text());

      const metricsData = await metricsResponse.json();
      const measures = metricsData.component.measures;

      const codeMetrics = new CodeMetrics();
      codeMetrics.project = project;
      codeMetrics.branch = branchName;
      codeMetrics.language = this.detectLanguage(measures);
      
      measures.forEach((measure: any) => {
        switch (measure.metric) {
          case "ncloc":
            codeMetrics.linesOfCode = parseInt(measure.value);
            break;
          case "coverage":
            codeMetrics.coverage = parseFloat(measure.value);
            break;
          case "duplicated_lines_density":
            codeMetrics.duplicatedLines = parseFloat(measure.value);
            break;
          case "violations":
            codeMetrics.violations = parseInt(measure.value);
            break;
          case "files":
            codeMetrics.filesCount = parseInt(measure.value);
            break;
          case "complexity":
            codeMetrics.complexity = parseInt(measure.value);
            break;
        }
      });

      // Save metrics
      await this.metricsRepo.save(codeMetrics);

      // Update project status
      project.result = "Analysis completed";
      await this.projectRepo.save(project);

    } catch (error) {
      console.error(`[storeAnalysisResults] Error storing results:`, error);
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  private detectLanguage(measures: any[]): string {
    const languageMeasure = measures.find(m => m.metric === "ncloc_language_distribution");
    if (languageMeasure) {
      const languages = languageMeasure.value.split(';');
      return languages[0].split('=')[0] || "unknown";
    }
    return "unknown";
  }
}