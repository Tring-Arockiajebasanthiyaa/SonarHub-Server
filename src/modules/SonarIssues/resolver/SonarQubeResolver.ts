import { Resolver, Query, Arg, Mutation } from "type-graphql";
import { SonarIssue } from "../entity/sonarIssue.entity";
import { Project } from "../../Project/entity/project.entity";
import { User } from "../../user/entity/user.entity";
import { CodeMetrics } from "../../codeMetrics/entity/codeMetrics.entity";
import dataSource from "../../../database/data-source";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { AnalysisResult } from "../graphql/types/AnalysisResult";
import { GraphQLJSONObject } from 'graphql-type-json';
import { LocReport } from "../graphql/types/LocReport";

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

  @Query(() => LocReport)
  async getLinesOfCodeReport(
    @Arg("githubUsername") githubUsername: string,
    @Arg("repoName") repoName: string
  ): Promise<LocReport> {
    try {
      const projectKey = `${githubUsername}_${repoName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      
      const project = await this.projectRepo.findOne({
        where: { repoName: projectKey },
        relations: ["codeMetrics"]
      });
    
      if (!project) {
        throw new Error(`Project "${repoName}" not found for user ${githubUsername}`);
      }

      // Calculate total lines from all branches
      const totalLines = project.codeMetrics.reduce((sum, metric) => {
        return sum + (metric.linesOfCode || 0);
      }, 0);

      // Get SonarQube analyzed lines (from default branch)
      const defaultBranchMetric = project.codeMetrics.find(m => m.branch === project.defaultBranch);
      const sonarQubeLines = defaultBranchMetric?.linesOfCode || 0;

      return {
        totalLines,
        sonarQubeLines,
        languageDistribution: project.languageDistribution || {},
        lastUpdated: project.lastAnalysisDate || new Date(),
        analysisDuration: project.analysisDuration,
        analysisStatus: project.result
      };
    } catch (error) {
      console.error('Error in getLinesOfCodeReport:', error);
      throw new Error('Failed to generate lines of code report');
    }
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
    
    // First get the latest lines of code data from GitHub
    const locData = await this.getRepositoryLinesOfCode(user, repo);
    
    let project = await this.projectRepo.findOne({ 
      where: { repoName: projectKey },
      relations: ["codeMetrics"] // Ensure we load existing metrics
    });

    // Initialize with current timestamp
    const analysisStartTime = new Date();
  
    if (!project) {
      project = this.projectRepo.create({
        title: repo.name,
        repoName: projectKey,
        description: repo.description || `Analysis for ${repo.name}`,
        githubUrl: repo.html_url,
        isPrivate: repo.private,
        defaultBranch: repo.default_branch,
        user,
        estimatedLinesOfCode: locData.totalLines,
        languageDistribution: locData.languages,
        username: user.username,
        analysisStartTime,
        result: "In Progress"
      });
    } else {
      // For existing projects, ensure we update all relevant fields
      project.githubUrl = repo.html_url;
      project.isPrivate = repo.private;
      project.defaultBranch = repo.default_branch;
      project.estimatedLinesOfCode = locData.totalLines;
      project.languageDistribution = locData.languages;
      project.analysisStartTime = analysisStartTime;
      project.result = "In Progress";
      
      // Clear existing metrics to prevent duplicates
      if (project.codeMetrics) {
        await this.metricsRepo.remove(project.codeMetrics);
      }
    }
  
    // Save the project first to ensure we have the latest data
    await this.projectRepo.save(project);
  
    try {
      await this.configureSonarQubeProject(user, project, repo, authHeader);
      await this.triggerSonarQubeAnalysis(project, authHeader);
      
      // Update with final status
      const analysisEndTime = new Date();
      project.result = "Analysis completed";
      project.analysisEndTime = analysisEndTime;
      project.analysisDuration = Math.floor(
        (analysisEndTime.getTime() - analysisStartTime.getTime()) / 1000
      );
      project.lastAnalysisDate = new Date();
      
      // Save again with final status
      await this.projectRepo.save(project);
    } catch (error) {
      const analysisEndTime = new Date();
      project.result = "Analysis failed";
      project.analysisEndTime = analysisEndTime;
      project.analysisDuration = Math.floor(
        (analysisEndTime.getTime() - analysisStartTime.getTime()) / 1000
      );
      
      await this.projectRepo.save(project);
      throw error;
    }
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
      
      // Create project if it doesn't exist
      if (projectData.components.length === 0) {
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
  
      // Configure project properties
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
  
    } catch (error) {
      console.error(`[configureSonarQubeProject] Error configuring ${repo.name}:`, error);
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  private async configureSonarQubeWebhook(project: Project, authHeader: string) {
    try {
      const webhookName = `Analysis_${project.repoName}`;
      const webhookUrl = `${process.env.WEBHOOK_URL}?projectId=${project.u_id}`;
      
      const response = await fetch(
        `${process.env.SONARQUBE_API_URL}/api/webhooks/create`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            name: webhookName,
            url: webhookUrl,
            project: project.repoName,
            secret: process.env.WEBHOOK_SECRET || ''
          }).toString(),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create webhook: ${await response.text()}`);
      }
    } catch (error) {
      console.error(`[configureSonarQubeWebhook] Error:`, error);
      throw error;
    }
  }

  private async triggerSonarQubeAnalysis(project: Project, authHeader: string): Promise<boolean> {
    try {
        await this.configureSonarQubeWebhook(project, authHeader);

        const scannerParams = {
            'sonar.projectKey': project.repoName,
            'sonar.projectName': project.title,
            'sonar.host.url': process.env.SONARQUBE_API_URL || '',
            'sonar.login': process.env.SONARQUBE_API_TOKEN || '',
            'sonar.scm.provider': 'git',
            'sonar.scm.url': project.githubUrl,
            'sonar.sourceEncoding': 'UTF-8',
            'sonar.sources': '.'
        };

        try {
            const { exec } = require('child_process') as typeof import('child_process');
            const scannerCommand = `sonar-scanner ${Object.entries(scannerParams)
                .map(([k, v]) => `-D${k}="${v}"`)
                .join(' ')}`;

            console.log('Executing SonarScanner with command:', scannerCommand);
            
            const analysisPromise = new Promise<string>((resolve, reject) => {
                exec(scannerCommand, (error: Error | null, stdout: string, stderr: string) => {
                    if (error) {
                        console.error('SonarScanner execution error:', error);
                        console.error('Stderr:', stderr);
                        reject(error);
                        return;
                    }
                    console.log('SonarScanner output:', stdout);
                    resolve(stdout);
                });
            });

            await analysisPromise;
        } catch (cliError: unknown) {
            console.error('Failed to execute SonarScanner:', cliError);
            throw new Error('SonarScanner execution failed');
        }

        await this.waitForProjectAnalysis(project, authHeader);
        
        return true;
    } catch (error: unknown) {
        console.error(`[triggerSonarQubeAnalysis] Error:`, error);
        throw error;
    }
  }
  private async waitForProjectAnalysis(
    project: Project,
    authHeader: string
  ) {
    let attempts = 0;
    const maxAttempts = 30; // 30 attempts * 10 seconds = 5 minutes max
    let lastAnalysisDate = project.lastAnalysisDate;

    while (attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

      try {
        const projectStatus = await fetch(
          `${SONARQUBE_API_URL}/api/project_analyses/search?project=${project.repoName}`,
          { headers: { Authorization: authHeader } }
        );

        if (projectStatus.ok) {
          const statusData = await projectStatus.json();
          if (statusData.analyses && statusData.analyses.length > 0) {
            const latestAnalysis = statusData.analyses[0];
            const analysisDate = new Date(latestAnalysis.date);
            
            if (!lastAnalysisDate || analysisDate > lastAnalysisDate) {
              // New analysis found
              return true;
            }
          }
        }
      } catch (error) {
        console.error('Error checking analysis status:', error);
      }
    }

    throw new Error('Analysis did not complete within expected time');
  }
  // In SonarQubeResolver class
@Mutation(() => Boolean)
public async handleAnalysisCompletion(
  @Arg("projectId") projectId: string,
  @Arg("authHeader") authHeader: string
) {
  const project = await this.projectRepo.findOne({ where: { u_id: projectId } });
  if (!project) {
    throw new Error('Project not found');
  }
  await this.storeAnalysisResults(project, authHeader);
  return true;
}
  private async getRepositoryLinesOfCode(
    user: User,
    repo: any
  ): Promise<{ totalLines: number; languages: Record<string, number> }> {
    try {
      const response = await fetch(
        `${GITHUB_API_URL}/repos/${user.username}/${repo.name}/languages`,
        {
          headers: { 
            Authorization: `Bearer ${user.githubAccessToken}`,
            Accept: "application/vnd.github.v3+json"
          }
        }
      );
  
      if (!response.ok) throw new Error(await response.text());
  
      const languagesData = await response.json();
      let totalLines = 0;
      const languages: Record<string, number> = {};
      
      // Language-specific line estimates (bytes per line)
      const bytesPerLine: Record<string, number> = {
        'JavaScript': 20,
        'TypeScript': 20,
        'Java': 15,
        'Python': 10,
        'Ruby': 10,
        'PHP': 15,
        'C++': 15,
        'C': 15,
        'Go': 15,
        'Swift': 15,
        'Kotlin': 15,
        'HTML': 30,
        'CSS': 25,
        'SCSS': 25,
        'JSON': 40
      };

      for (const [language, bytes] of Object.entries(languagesData)) {
        const avgBytesPerLine = bytesPerLine[language] || 20; // Default to 20 bytes/line
        const lines = Math.floor(Number(bytes) / avgBytesPerLine);
        languages[language] = Math.round(lines);
        totalLines += lines;
      }

      return { totalLines: Math.round(totalLines), languages };
    } catch (error) {
      console.error(`[getRepositoryLinesOfCode] Error:`, error);
      return { totalLines: 0, languages: {} };
    }
  }
  // In SonarQubeResolver class
@Mutation(() => Boolean)
public async handleWebhookEvent(
  @Arg("projectId") projectId: string,
  @Arg("status") status: string,
  @Arg("authHeader") authHeader: string
) {
  const project = await this.projectRepo.findOne({ where: { u_id: projectId } });
  if (!project) {
    throw new Error('Project not found');
  }

  switch (status) {
    case 'SUCCESS':
      project.result = 'Analysis completed';
      project.analysisEndTime = new Date();
      project.analysisDuration = Math.floor(
        (new Date().getTime() - project.analysisStartTime.getTime()) / 1000
      );
      await this.projectRepo.save(project);
      await this.storeAnalysisResults(project, authHeader);
      return true;

    case 'FAILED':
      project.result = 'Analysis failed';
      project.analysisEndTime = new Date();
      project.analysisDuration = Math.floor(
        (new Date().getTime() - project.analysisStartTime.getTime()) / 1000
      );
      await this.projectRepo.save(project);
      return true;

    default:
      console.warn(`Unknown analysis status: ${status}`);
      return false;
  }
 }
  private async storeAnalysisResults(
    project: Project,
    authHeader: string
  ) {
    try {
      const branchName = project.defaultBranch || 'main';
      
      // Get issues
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

      await this.sonarIssueRepo.save(issues);

      const metricsResponse = await fetch(
        `${SONARQUBE_API_URL}/api/measures/component?component=${project.repoName}&metricKeys=ncloc,ncloc_language_distribution,languages`,
        { headers: { Authorization: authHeader } }
      );
  
      if (!metricsResponse.ok) throw new Error(await metricsResponse.text());
  
      const metricsData = await metricsResponse.json();
      const measures = metricsData.component.measures || [];
  
      // Update language distribution
      const languageMeasure = measures.find((m:any ) => m.metric === "ncloc_language_distribution");
      if (languageMeasure) {
        project.languageDistribution = this.parseLanguageDistribution(languageMeasure.value);
      }
  
      // Get the list of languages
      const languagesMeasure = measures.find((m:any )=> m.metric === "languages");
      if (languagesMeasure) {
        const languages = languagesMeasure.value.split(',');
        console.log(languages,"Languages");
      }

      const codeMetrics = new CodeMetrics();
      codeMetrics.project = project;
      codeMetrics.branch = branchName;
      codeMetrics.language = this.detectLanguage(measures);
      
      measures.forEach((measure: any) => {
        switch (measure.metric) {
          case "ncloc":
            codeMetrics.linesOfCode = parseInt(measure.value);
            break;
          case "ncloc_language_distribution":
            project.languageDistribution = this.parseLanguageDistribution(measure.value);
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
          case "sqale_index":
            codeMetrics.technicalDebt = parseInt(measure.value);
            break;
        }
      });

      await this.metricsRepo.save(codeMetrics);
      await this.projectRepo.save(project);

    } catch (error) {
      console.error(`[storeAnalysisResults] Error storing results:`, error);
      throw error;
    }
  }

  private parseLanguageDistribution(distribution: string): Record<string, number> {
    const result: Record<string, number> = {};
    if (!distribution) return result;
    
    distribution.split(';').forEach(item => {
      const [lang, lines] = item.split('=');
      if (lang && lines) {
        result[lang] = parseInt(lines);
      }
    });
    
    return result;
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