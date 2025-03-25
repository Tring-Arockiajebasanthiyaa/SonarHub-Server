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
    try {
      const userRepository = dataSource.getRepository(User);
      const userActivityRepository = dataSource.getRepository(UserActivity);
      
      const user = await userRepository.findOne({ where: { username: githubUsername } });
      if (!user) {
        console.log(`[WARN] User with GitHub username '${githubUsername}' not found.`);
        return null;
      }
      
      const githubApiUrl = `https://api.github.com/users/${githubUsername}/repos`;
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
          if (repoDetails.private) privateRepoCount++;
          else publicRepoCount++;
        }
      }
      const issuePercentage = totalRepositories > 0 ? (overallSonarIssues / totalRepositories) * 100 : 0;
      let dangerLevel = "Low";
      if (issuePercentage > 60) dangerLevel = "Critical";
      else if (issuePercentage > 30) dangerLevel = "High";
      else if (issuePercentage > 10) dangerLevel = "Medium";

      let userActivity = await userActivityRepository.findOne({ where: { githubUsername } });
      if (userActivity) {
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
      await userActivityRepository.save(userActivity);
      return userActivity;
    } catch (error) {
      console.error(`[ERROR] Failed to fetch user activity:`, error);
      throw new Error("Failed to fetch user activity.");
    }
  }
}
