import { SonarQubeResolver } from "../../SonarIssues/resolver/SonarQubeResolver";
import { postGitHubComment } from "./gitHub.service";
import dotenv from "dotenv";
dotenv.config();

const sonarQubeResolver = new SonarQubeResolver();
const SONARQUBE_API_URL = process.env.SONARQUBE_API_URL;
const SONARQUBE_TOKEN = process.env.SONARQUBE_API_TOKEN;

export async function triggerPRAnalysis(username: string, repo: string, branch: string, prId: number) {
  const analysisResult = await sonarQubeResolver.triggerAutomaticPullRequestAnalysis(username, repo);
  const projectKey = `${username}_${repo}_${branch}`;
  const sourceBranch = "main";
  const sonarIssuesUrl = `${SONARQUBE_API_URL}/api/issues/search?projectKeys=${projectKey}&branch=${sourceBranch}&issueStatuses=OPEN,CONFIRMED`;

  let issueSummary = `SonarQube Analysis for branch \`${branch}\`\n`;

  try {
    const authHeader = `Basic ${Buffer.from(`${SONARQUBE_TOKEN}:`).toString("base64")}`;

    const response = await fetch(sonarIssuesUrl, {
      headers: {
        Authorization: authHeader
      }
    });

    if (!response.ok) {
      throw new Error(`SonarQube API responded with status ${response.status}`);
    }

    const data = await response.json();

    if (data.issues && data.issues.length > 0) {
      data.issues.slice(0, 10).forEach((issue: any, index: number) => {
        const filePath = issue.component?.split(":")[1] || issue.component;
        const line = issue.line ? `line ${issue.line}` : "unknown line";
        issueSummary += `**${index + 1}.** [${issue.severity}] ${issue.message} in \`${filePath}\` at ${line}\n`;
      });

      if (data.issues.length > 10) {
        issueSummary += `\n...and ${data.issues.length - 10} more issue(s).\n`;
      }
    } else {
      issueSummary += `No issues found.\n`;
    }
  } catch (err: any) {
    issueSummary += `Could not fetch issues. Error: ${err.message}`;
    console.error("SonarQube fetch error:", err);
  }

  const comment = `${analysisResult} for branch \`${branch}\` `;
  console.log("Generated Sonar Comment:", comment);
  try {
    await postGitHubComment(username, repo, prId, issueSummary);
    console.log("Posting GitHub comment:", issueSummary);
  } catch (err: any) {
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Headers:", err.response.headers);
      console.error("Data:", err.response.data);
    } else {
      console.error("Error Message:", err.message);
    }
  }

  return issueSummary;
}
