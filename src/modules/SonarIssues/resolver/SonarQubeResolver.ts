import { Resolver, Query, Arg, Mutation } from "type-graphql";
import { SonarIssue } from "../entity/SonarIssue.entity";
import { Project } from "../../Project/entity/project.entity";
import { User } from "../../user/entity/user.entity";
import { CodeMetrics } from "../../codeMetrics/entity/codeMetrics.entity";
import dataSource from "../../../database/data-source";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { AnalysisResult } from "../graphql/types/AnalysisResult";
import { GraphQLJSONObject } from 'graphql-type-json';
import { LocReport } from "../graphql/types/LocReport";
import path from 'path';

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
    
    const locData = await this.getRepositoryLinesOfCode(user, repo);
    
    let project = await this.projectRepo.findOne({ 
      where: { repoName: projectKey },
      relations: ["codeMetrics"] 
    });

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

    await this.projectRepo.save(project);
  
    try {
      await this.configureSonarQubeProject(user, project, repo, authHeader);
      await this.triggerSonarQubeAnalysis(project, authHeader);
      const analysisEndTime = new Date();
      project.result = "Analysis completed";
      project.analysisEndTime = analysisEndTime;
      project.analysisDuration = Math.floor(
        (analysisEndTime.getTime() - analysisStartTime.getTime()) / 1000
      );
      project.lastAnalysisDate = new Date();
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
      const projectResponse = await fetch(
        `${SONARQUBE_API_URL}/api/projects/search?projects=${projectKey}`,
        { headers: { Authorization: authHeader } }
      );
  
      if (!projectResponse.ok) throw new Error(await projectResponse.text());
  
      const projectData = await projectResponse.json();
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

      const propertiesToSet = [
        { key: 'sonar.projectKey', value: projectKey },
        { key: 'sonar.projectName', value: repo.name },
        { key: 'sonar.scm.provider', value: 'git' },
        { key: 'sonar.scm.url', value: repo.html_url },
        { key: 'sonar.links.scm', value: repo.html_url },
        { key: 'sonar.links.homepage', value: repo.html_url },
        { key: 'sonar.github.repository', value: repo.full_name },
        { key: 'sonar.github.oauth', value: user.githubAccessToken || '' }
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
  
      const user = await this.userRepo.findOne({
        where: { username: project.username },
        select: ["u_id", "githubAccessToken"]
      });
  
      if (!user || !user.githubAccessToken) {
        throw new Error(`GitHub access token not found for user ${project.username}`);
      }
  
      await this.ensureSonarQubeProject(project, authHeader);
      await this.updateProjectSettings(project, authHeader, user.githubAccessToken);
  
      const repoContentsResponse = await fetch(
        `${GITHUB_API_URL}/repos/${project.username}/${project.title}/contents`,
        {
          headers: {
            Authorization: `Bearer ${user.githubAccessToken}`,
            Accept: "application/vnd.github.v3+json"
          }
        }
      );
  
      if (repoContentsResponse.status === 404 || (repoContentsResponse.ok && (await repoContentsResponse.json()).length === 0)) {
        project.languageDistribution = {};
        project.result = "Analysis completed (empty repository)";
        project.analysisEndTime = new Date();
        await this.projectRepo.save(project);
        return true;
      }
  
      if (!repoContentsResponse.ok) {
        throw new Error(`Failed to check repository contents: ${await repoContentsResponse.text()}`);
      }
  
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const { execSync, exec } = require('child_process');
  
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-'));
      const repoPath = path.join(tempDir, "repo");
  
      try {
        console.log(`Cloning repository: ${project.githubUrl} into ${repoPath}`);
        execSync(`git clone ${project.githubUrl} ${repoPath}`, { stdio: 'inherit' });
  
        const propertiesFile = path.join(repoPath, 'sonar-project.properties');
        const scannerProperties = [
          `sonar.projectKey=${project.repoName}`,
          `sonar.projectName=${project.title}`,
          `sonar.host.url=${SONARQUBE_API_URL}`,
          `sonar.login=${SONARQUBE_API_TOKEN}`,
          `sonar.scm.provider=git`,
          `sonar.sourceEncoding=UTF-8`,
          `sonar.scm.forceReloadAll=true`,
          `sonar.scm.revision=HEAD`,
          `sonar.scm.disabled=false`,
          `sonar.scm.exclusions.disabled=true`
        ].join('\n');
  
        fs.writeFileSync(propertiesFile, scannerProperties);
        console.log('SonarQube properties file created.');
        const scannerCommand = `sonar-scanner -Dproject.settings=${propertiesFile} -Dsonar.projectBaseDir=${repoPath}`;
        console.log('Executing SonarScanner:', scannerCommand);
  
        await new Promise<void>((resolve, reject) => {
          exec(scannerCommand, (error: Error | null, stdout: string, stderr: string) => {
            if (error) {
              console.error('SonarScanner execution error:', error, stderr);
              reject(error);
            } else {
              console.log('SonarScanner output:', stdout);
              resolve();
            }
          });
        });
  
        return await this.waitForProjectAnalysis(project, authHeader);
      } catch (cliError) {
        console.error('Failed to execute SonarScanner:', cliError);
        throw new Error('SonarScanner execution failed');
      } finally {
        try {
          console.log(`Deleting temporary repo at ${repoPath}`);
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error('Error cleaning up temporary files:', cleanupError);
        }
      }
    } catch (error) {
      console.error(`[triggerSonarQubeAnalysis] Error:`, error);
      throw new Error(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  private async ensureSonarQubeProject(project: Project, authHeader: string) {
    try {
      
      const projectResponse = await fetch(
        `${SONARQUBE_API_URL}/api/projects/search?projects=${project.repoName}`,
        { headers: { Authorization: authHeader } }
      );
  
      if (!projectResponse.ok) throw new Error(await projectResponse.text());
  
      const projectData = await projectResponse.json();
      
      if (projectData.components.length === 0) {
        const createResponse = await fetch(`${SONARQUBE_API_URL}/api/projects/create`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            name: project.title,
            project: project.repoName,
            visibility: "public",
          }).toString(),
        });
  
        if (!createResponse.ok) throw new Error(await createResponse.text());
      }
    } catch (error) {
      console.error(`[ensureSonarQubeProject] Error:`, error);
      throw error;
    }
  }
  private async updateProjectSettings(project: Project, authHeader: string, githubToken: string) {
    const settings = [
      { key: 'sonar.projectKey', value: project.repoName },
      { key: 'sonar.projectName', value: project.title },
      { key: 'sonar.scm.provider', value: 'git' },
      { key: 'sonar.scm.url', value: project.githubUrl },
      { key: 'sonar.links.scm', value: project.githubUrl },
      { key: 'sonar.links.homepage', value: project.githubUrl },
      { key: 'sonar.host.url', value: SONARQUBE_API_URL || '' },
      { key: 'sonar.login', value: SONARQUBE_API_TOKEN || '' },
      { key: 'sonar.sourceEncoding', value: 'UTF-8' },
      { key: 'sonar.github.repository', value: project.githubUrl.replace('https://github.com/', '') },
      { key: 'sonar.github.oauth', value: githubToken },
      { key: 'sonar.scm.disabled', value: 'false' },
      { key: 'sonar.scm.exclusions.disabled', value: 'true' },
      { key: 'sonar.analysis.mode', value: 'issues' },
      { key: 'sonar.analysis.skipPublish', value: 'false' },
      { key: 'sonar.scm.forceReloadAll', value: 'true' },
      { key: 'sonar.scm.revision', value: 'HEAD' }
    ];
  
    for (const setting of settings) {
      try {
        const response = await fetch(`${SONARQUBE_API_URL}/api/settings/set`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            key: setting.key,
            value: setting.value,
            component: project.repoName
          }).toString()
        });
  
        if (!response.ok) {
          console.warn(`Failed to set setting ${setting.key}:`, await response.text());
        }
      } catch (error) {
        console.error(`Error setting ${setting.key}:`, error);
      }
    }
  }
  private async waitForProjectAnalysis(project: Project, authHeader: string) {
    let attempts = 0;
    const maxAttempts = 30; 
  
    while (attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
  
      try {
        const ceActivityResponse = await fetch(
          `${SONARQUBE_API_URL}/api/ce/component?component=${project.repoName}`,
          { headers: { Authorization: authHeader } }
        );
  
        if (ceActivityResponse.ok) {
          const activityData = await ceActivityResponse.json();
          const currentTask = activityData.current && activityData.current.status;
          
          if (currentTask === 'SUCCESS') {
            return true;
          }
          if (currentTask === 'FAILED') {
            throw new Error(`Analysis failed: ${activityData.current.errorMessage || 'Unknown error'}`);
          }
        }
      } catch (error) {
        console.error('Error checking analysis status:', error);
      }
    }
  
    throw new Error('Analysis did not complete within expected time');
  }
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
 private async storeAnalysisResults(project: Project, authHeader: string) {
  try {
    const branchName = project.defaultBranch || 'main';
    await this.sonarIssueRepo.delete({ project: { u_id: project.u_id } });
    const metricsResponse = await fetch(
      `${SONARQUBE_API_URL}/api/measures/component?component=${project.repoName}&branch=${branchName}&metricKeys=` +
      'ncloc,ncloc_language_distribution,languages,files,coverage,duplicated_lines_density,' +
      'violations,complexity,sqale_index,reliability_rating,security_rating,security_review_rating,' +
      'sqale_debt_ratio,bugs,vulnerabilities,code_smells,new_technical_debt',
      { headers: { Authorization: authHeader } }
    );

    if (!metricsResponse.ok) throw new Error(await metricsResponse.text());

    const metricsData = await metricsResponse.json();
    const measures = metricsData.component.measures || [];

    const qualityGateResponse = await fetch(
      `${SONARQUBE_API_URL}/api/qualitygates/project_status?projectKey=${project.repoName}&branch=${branchName}`,
      { headers: { Authorization: authHeader } }
    );

    let qualityGateStatus = 'UNKNOWN';
    if (qualityGateResponse.ok) {
      const qualityGateData = await qualityGateResponse.json();
      qualityGateStatus = qualityGateData.projectStatus.status;
    }

    let page = 1;
    let totalIssues = 0;
    let fetchedIssues = 0;
    const allIssues: SonarIssue[] = [];

    do {
      const issuesResponse = await fetch(
        `${SONARQUBE_API_URL}/api/issues/search?componentKeys=${project.repoName}&branch=${branchName}&ps=500&p=${page}`,
        { headers: { Authorization: authHeader } }
      );

      if (!issuesResponse.ok) {
        throw new Error(`Failed to fetch issues: ${await issuesResponse.text()}`);
      }

      const issuesData = await issuesResponse.json();
      totalIssues = issuesData.total || 0;
      fetchedIssues += issuesData.issues?.length || 0;

      if (issuesData.issues && issuesData.issues.length > 0) {
        const transformedIssues = issuesData.issues.map((issue: any) => {
          const newIssue = new SonarIssue();
          newIssue.key = issue.key;
          newIssue.type = issue.type;
          newIssue.severity = issue.severity;
          newIssue.message = issue.message;
          newIssue.rule = issue.rule;
          newIssue.component = issue.component;
          newIssue.line = issue.line || 0;
          newIssue.status = issue.status;
          newIssue.resolution = issue.resolution;
          newIssue.project = project;
          return newIssue;
        });

        allIssues.push(...transformedIssues);
      }

      page++;
    } while (fetchedIssues < totalIssues);

    if (allIssues.length > 0) {
      await this.sonarIssueRepo.save(allIssues);
      console.log(`Saved ${allIssues.length} issues to database`);
    } else {
      console.log('No issues found to save');
    }

    let codeMetrics = await this.metricsRepo.findOne({ 
      where: { 
        project: { u_id: project.u_id },
        branch: branchName
      }
    });

    if (!codeMetrics) {
      codeMetrics = new CodeMetrics();
      codeMetrics.project = project;
      codeMetrics.branch = branchName;
    }

    // Update all metrics
    measures.forEach((measure: any) => {
      switch (measure.metric) {
        case "ncloc":
          codeMetrics.linesOfCode = parseInt(measure.value) || 0;
          break;
        case "files":
          codeMetrics.filesCount = parseInt(measure.value) || 0;
          break;
        case "coverage":
          codeMetrics.coverage = parseFloat(measure.value) || 0;
          break;
        case "duplicated_lines_density":
          codeMetrics.duplicatedLines = parseFloat(measure.value) || 0;
          break;
        case "violations":
          codeMetrics.violations = parseInt(measure.value) || 0;
          break;
        case "complexity":
          codeMetrics.complexity = parseInt(measure.value) || 0;
          break;
        case "sqale_index":
          codeMetrics.technicalDebt = parseInt(measure.value) || 0;
          break;
        case "reliability_rating":
          codeMetrics.reliabilityRating = parseFloat(measure.value) || 0;
          break;
        case "security_rating":
          codeMetrics.securityRating = parseFloat(measure.value) || 0;
          break;
        case "bugs":
          codeMetrics.bugs = parseInt(measure.value) || 0;
          break;
        case "vulnerabilities":
          codeMetrics.vulnerabilities = parseInt(measure.value) || 0;
          break;
        case "code_smells":
          codeMetrics.codeSmells = parseInt(measure.value) || 0;
          break;
        case "sqale_debt_ratio":
          codeMetrics.debtRatio = parseFloat(measure.value) || 0;
          break;
      }
    });

    // Store quality gate status
    codeMetrics.qualityGateStatus = qualityGateStatus;

    // Detect primary language
    codeMetrics.language = this.detectLanguage(measures);

    await this.metricsRepo.save(codeMetrics);
    await this.projectRepo.save(project);

    console.log(`Successfully stored ${allIssues.length} issues for project ${project.repoName}`);

  } catch (error) {
    console.error(`[storeAnalysisResults] Error storing results:`, error);
    throw error;
  }
}


private parseLanguageDistribution(distribution: string): Record<string, number> {
  const result: Record<string, number> = {};
  if (!distribution) return result;
  
  // Handle both formats: "java=123;js=45" and "java=123,js=45"
  const items = distribution.split(/[;,]/).filter(item => item.includes('='));
  
  items.forEach(item => {
    const [lang, lines] = item.split('=');
    if (lang && lines && !isNaN(Number(lines))) {
      result[lang.trim()] = parseInt(lines);
    }
  });
  return Object.fromEntries(
    Object.entries(result).sort(([,a], [,b]) => b - a)
  );
}

private detectLanguage(measures: any[]): string {
  const languageMeasure = measures.find(m => m.metric === "ncloc_language_distribution");
  if (languageMeasure) {
    const distribution = this.parseLanguageDistribution(languageMeasure.value);
    return Object.keys(distribution)[0] || "unknown";
  }
  return "unknown";
 }
}