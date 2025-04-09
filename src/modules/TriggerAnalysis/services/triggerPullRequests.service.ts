import { SonarQubeResolver } from "../../SonarIssues/resolver/SonarQubeResolver";
import { postGitHubComment } from "./gitHub.service";
import dataSource from "../../../database/data-source";
import { User } from "../../user/entity/user.entity";      
import dotenv from "dotenv";
dotenv.config();

const sonarQubeResolver = new SonarQubeResolver();
const SONARQUBE_API_URL = process.env.SONARQUBE_API_URL;
const SONARQUBE_TOKEN = process.env.SONARQUBE_API_TOKEN;
const GITHUB_API_URL = process.env.GITHUB_API;

export async function triggerPRAnalysis(username: string, repo: string, branch: string, prId: number) {
  
  const userRepository = dataSource.getRepository(User);

  const user = await userRepository.findOne({
    where: { username },
    select: ["githubAccessToken"]
  });

  if (!user) {
    console.log(`User with GitHub username '${username}' not found.`);
    return null;
  }

  const userGithubToken = user.githubAccessToken;

  if (!userGithubToken) {
    console.log(`No GitHub token found for user '${username}'.`);
    throw new Error("GitHub access token is missing for this user.");
  }

  
  const prResponse = await fetch(`${GITHUB_API_URL}/repos/${username}/${repo}/pulls/${prId}`, {
    headers: {
      Authorization: `Bearer ${userGithubToken}`,
      Accept: "application/vnd.github.v3+json"
    }
  });

  if (!prResponse.ok) {
    throw new Error(`Failed to fetch PR with ID ${prId}: ${prResponse.statusText}`);
  }

  const prData = await prResponse.json();
console.log("PR Data:", JSON.stringify(prData, null, 2)); // Log entire PR object
console.log("PR State from GitHub:", prData.state);

  if (prData.state !== "open") {
    const closedMessage = `PR #${prId} is closed. No analysis performed.`;
    console.log(closedMessage);

    try {
      await postGitHubComment(username, repo, prId, closedMessage);
    } catch (err: any) {
      console.error("Failed to post 'PR is closed' comment:", err.message);
    }

    return closedMessage;
  }

  
  const analysisResult = await sonarQubeResolver.triggerBranchAnalysis(username, repo, branch);
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
