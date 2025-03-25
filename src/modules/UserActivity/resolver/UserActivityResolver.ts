import { Resolver, Query, Ctx, Arg } from "type-graphql";
import { UserActivity } from "../entity/UserActivity.entity";
import { User } from "../../user/entity/user.entity";
import dataSource from "../../../database/data-source";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { MyContext } from "../../../types/MyContext";

dotenv.config();

@Resolver()
export class UserActivityResolver {
  private SONARQUBE_URL = process.env.SONARQUBE_API_URL || "http://localhost:9000";
  private SONARQUBE_TOKEN = process.env.SONARQUBE_API_TOKEN || "";
  private GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

  @Query(() => UserActivity, { nullable: true })
  async getUserActivity(
    @Arg("githubUsername") githubUsername: string,
    @Ctx() ctx: MyContext
  ): Promise<UserActivity | null> {
    console.log(`[INFO] Fetching user activity for GitHub user: ${githubUsername}`);
    console.log(githubUsername);
    try {
      const userRepository = dataSource.getRepository(User);
      const userActivityRepository = dataSource.getRepository(UserActivity);

      // **Fetch user details by GitHub username**
      const user = await userRepository.findOne({ where: { username: githubUsername } });
      if (!user) {
        console.log(`[WARN] User with GitHub username '${githubUsername}' not found.`);
        return null;
      }

      console.log(`[INFO] Found user:`, user);

      // **Fetch repositories from GitHub**
      const githubApiUrl = `https://api.github.com/users/${githubUsername}/repos`;
      console.log("[INFO] Fetching GitHub repositories...");

      const githubResponse = await fetch(githubApiUrl, {
        headers: {
          Authorization: `token ${this.GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!githubResponse.ok) {
        throw new Error(`GitHub API Error: ${githubResponse.status} - ${await githubResponse.text()}`);
      }

      const repos = await githubResponse.json();

      // **Initialize variables**
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
        // **Fetch Repo Details**
        const repoDetailsResponse = await fetch(`https://api.github.com/repos/${githubUsername}/${repo.name}`, {
          headers: { Authorization: `token ${this.GITHUB_TOKEN}` },
        });

        if (repoDetailsResponse.ok) {
          const repoDetails = await repoDetailsResponse.json();

          repoCommits.push(`${repo.name}: ${repoDetails.size} KB`);
          if (repoDetails.language) languagesUsed.add(repoDetails.language);
          totalStars += repoDetails.stargazers_count;
          totalForks += repoDetails.forks_count;

          if (!earliestRepo || new Date(repoDetails.created_at) < new Date(earliestRepo.created_at)) {
            earliestRepo = repoDetails;
          }

          if (!latestUpdatedRepo || new Date(repoDetails.updated_at) > new Date(latestUpdatedRepo.updated_at)) {
            latestUpdatedRepo = repoDetails;
          }

          if (repoDetails.private) {
            privateRepoCount++;
          } else {
            publicRepoCount++;
          }
        }

        // **Fetch commit count**
        const commitsResponse = await fetch(
          `https://api.github.com/repos/${githubUsername}/${repo.name}/commits?per_page=100`,
          { headers: { Authorization: `token ${this.GITHUB_TOKEN}` } }
        );

        if (commitsResponse.ok) {
          const commits = await commitsResponse.json();
          totalCommits += commits.length;
          commitHistory.push(`${repo.name}: ${commits.length} commits`);
        }

        // **Check if repo exists in SonarQube**
        const sonarResponse = await fetch(`${this.SONARQUBE_URL}/api/projects/search?projects=${repo.name}`, {
          headers: { Authorization: `Basic ${Buffer.from(this.SONARQUBE_TOKEN + ":").toString("base64")}` },
        });

        const sonarData = await sonarResponse.json();
        const projectExists = sonarData.components && sonarData.components.length > 0;

        // **Create project in SonarQube if it doesn't exist**
        if (!projectExists) {
          await fetch(`${this.SONARQUBE_URL}/api/projects/create`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(this.SONARQUBE_TOKEN + ":").toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: `name=${repo.name}&project=${repo.name}`,
          });
        }

       
        const sonarIssuesResponse = await fetch(
          `${this.SONARQUBE_URL}/api/issues/search?componentKeys=${repo.name}&resolved=false`,
          {
            headers: { Authorization: `Basic ${Buffer.from(this.SONARQUBE_TOKEN + ":").toString("base64")}` },
          }
        );

        if (sonarIssuesResponse.ok) {
          const sonarIssuesData = await sonarIssuesResponse.json();
          overallSonarIssues += sonarIssuesData.total;
        }
      }
      const issuePercentage = totalRepositories > 0 ? (overallSonarIssues / totalRepositories) * 100 : 0;

      // Determine danger level
      let dangerLevel = "Low";
      if (issuePercentage > 60) {
        dangerLevel = "Critical";
      } else if (issuePercentage > 30) {
        dangerLevel = "High";
      } else if (issuePercentage > 10) {
        dangerLevel = "Medium";
      }
      
      // **Save or Update User Activity**
      const userActivity = userActivityRepository.create({
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
      

      await userActivityRepository.save(userActivity);
      return userActivity;
    } catch (error) {
      console.error(`[ERROR] Failed to fetch user activity:`, error);
      throw new Error("Failed to fetch user activity.");
    }
  }
}
