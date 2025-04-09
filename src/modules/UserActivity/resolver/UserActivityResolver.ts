import { Resolver, Query, Ctx, Arg } from "type-graphql";
import { UserActivity } from "../entity/userActivity.entity";
import { User } from "../../user/entity/user.entity";
import dataSource from "../../../database/data-source";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { MyContext } from "../../../types/MyContext";
import axios from "axios";
dotenv.config();

@Resolver()
export class UserActivityResolver {
  private SONARQUBE_URL = process.env.SONARQUBE_API_URL || "http://localhost:9000";
  private SONARQUBE_TOKEN = process.env.SONARQUBE_API_TOKEN || "";
  private  GITHUB_API_URL = process.env.GITHUB_API;
  @Query(() => UserActivity, { nullable: true })
async getUserActivity(
  @Arg("githubUsername") githubUsername: string,
  @Ctx() ctx: MyContext
): Promise<UserActivity | null> {
  console.log(`Fetching user activity for GitHub user: ${githubUsername}`);

  try {
    const userRepository = dataSource.getRepository(User);
    const userActivityRepository = dataSource.getRepository(UserActivity);

    const user = await userRepository.findOne({ where: { username: githubUsername } });

    if (!user) {
      console.log(`User with GitHub username '${githubUsername}' not found.`);
      return null;
    }

    const userGithubToken = user.githubAccessToken;
    
    if (!userGithubToken) {
      console.log(`No GitHub token found for user '${githubUsername}'.`);
      throw new Error("GitHub access token is missing for this user.");
    }

    console.log(`Found user:`, user);

    const githubApiUrl = `${this.GITHUB_API_URL}/user/repos`;
    console.log("Fetching GitHub repositories...");

    const githubResponse = await fetch(githubApiUrl, {
      headers: {
        Authorization: `Bearer ${userGithubToken}`,  
        Accept: "application/vnd.github.v3+json",
      },
    });
    console.log(userGithubToken);
    if (!githubResponse.ok) {
      throw new Error(`GitHub API Error: ${githubResponse.status} - ${await githubResponse.text()}`);
    }

    const repos = await githubResponse.json();

    let totalCommits = 0;
    let totalRepositories = repos.length;
    let totalStars = 0;
    let totalForks = 0;
    let publicRepoCount = 0;
    let privateRepoCount = 0;
    let repoCommits: string[] = [];
    let commitHistory: string[] = [];
    let languagesUsed = new Set<string>();
    let earliestRepo: any = null;
    let latestUpdatedRepo: any = null;
    let overallSonarIssues = 0;

    for (const repo of repos) {
      if (repo.language) languagesUsed.add(repo.language);
      totalStars += repo.stargazers_count;
      totalForks += repo.forks_count;
      repoCommits.push(`${repo.name}: ${repo.size} KB`);

      if (!earliestRepo || new Date(repo.created_at) < new Date(earliestRepo.created_at)) {
        earliestRepo = repo;
      }

      if (!latestUpdatedRepo || new Date(repo.updated_at) > new Date(latestUpdatedRepo.updated_at)) {
        latestUpdatedRepo = repo;
      }
      const { data: repos } = await axios.get(`${process.env.GITHUB_API}/user/repos`, {
               headers: { Authorization: `token ${userGithubToken}` },
               params: { visibility: "private", per_page: 100 },
             });
     
      console.log("Private Repositories:", repos.map((repo: any) => repo.name));
     
      if (repo.private) {
        privateRepoCount++;
      } else {
        publicRepoCount++;
      }


      const commitsResponse = await fetch(
        `${this.GITHUB_API_URL}/repos/${githubUsername}/${repo.name}/commits?per_page=100`,
        { headers: { Authorization: `Bearer ${userGithubToken}` } }  
      );

      if (commitsResponse.ok) {
        const commits = await commitsResponse.json();
        totalCommits += commits.length;
        commitHistory.push(`${repo.name}: ${commits.length} commits`);
      }

      try {
        const sonarIssuesResponse = await fetch(
          `${this.SONARQUBE_URL}/api/issues/search?componentKeys=${repo.name}&resolved=false`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(this.SONARQUBE_TOKEN + ":").toString("base64")}`,
            },
          }
        );
      
        if (sonarIssuesResponse.ok) {
          const sonarIssuesData = await sonarIssuesResponse.json();
          overallSonarIssues += sonarIssuesData.total;
        } else {
          console.warn(`Failed to fetch SonarQube issues for ${repo.name}: ${sonarIssuesResponse.status}`);
        }
      } catch (sonarError) {
        console.warn(`Error fetching SonarQube data for ${repo.name}:`, sonarError);
      }
      
    }

    const issuePercentage = totalRepositories > 0 ? (overallSonarIssues / totalRepositories) * 100 : 0;

   
    let dangerLevel = "Low";
    if (issuePercentage > 60) {
      dangerLevel = "Critical";
    } else if (issuePercentage > 30) {
      dangerLevel = "High";
    } else if (issuePercentage > 10) {
      dangerLevel = "Medium";
    }

    let userActivity = await userActivityRepository.findOne({ where: { githubUsername } });

    if (userActivity) {
      console.log(`[INFO] Updating existing user activity for ${githubUsername}`);

      userActivity.totalRepositories = totalRepositories;
      userActivity.totalCommits = totalCommits;
      userActivity.totalStars = totalStars;
      userActivity.totalForks = totalForks;
      userActivity.publicRepoCount = publicRepoCount;
      userActivity.privateRepoCount = privateRepoCount;
      userActivity.languagesUsed = Array.from(languagesUsed);
      userActivity.topContributedRepo = latestUpdatedRepo ? latestUpdatedRepo.name : "";
      userActivity.earliestRepoCreatedAt = earliestRepo ? earliestRepo.created_at : null;
      userActivity.mostRecentlyUpdatedRepo = latestUpdatedRepo ? latestUpdatedRepo.updated_at : null;
      userActivity.lastActive = new Date();
      userActivity.commitHistory = commitHistory;
      userActivity.repoCommits = repoCommits;
      userActivity.sonarIssues = overallSonarIssues.toString();
      userActivity.issuePercentage = issuePercentage.toFixed(2) + "%";
      userActivity.dangerLevel = dangerLevel;
    } else {
      console.log(`Creating new user activity for ${githubUsername}`);

      userActivity = userActivityRepository.create({
        githubUsername,
        totalRepositories,
        totalCommits,
        totalStars,
        totalForks,
        publicRepoCount,
        privateRepoCount,
        languagesUsed: Array.from(languagesUsed),
        topContributedRepo: latestUpdatedRepo ? latestUpdatedRepo.name : "",
        earliestRepoCreatedAt: earliestRepo ? earliestRepo.created_at : null,
        mostRecentlyUpdatedRepo: latestUpdatedRepo ? latestUpdatedRepo.updated_at : null,
        lastActive: new Date(),
        commitHistory,
        repoCommits,
        sonarIssues: overallSonarIssues.toString(),
        issuePercentage: issuePercentage.toFixed(2) + "%",
        dangerLevel,
      });
    }

    console.log(userActivity);
    await userActivityRepository.save(userActivity);
    return userActivity;
  } catch (error) {
    console.error(`Failed to fetch user activity:`, error);
    throw new Error("Failed to fetch user activity.");
  }
}
}
