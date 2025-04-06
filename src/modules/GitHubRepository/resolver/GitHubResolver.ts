import { Resolver, Query, Arg } from "type-graphql";
import fetch from "node-fetch";
import { Repo } from "../entity/repo.entity";
import { User } from "../../user/entity/user.entity";
import dataSource from "../../../database/data-source";
import dotenv from "dotenv";
dotenv.config();

const GITHUB_API_URL = process.env.GITHUB_API;

@Resolver()
export class GitHubResolver {
  @Query(() => [Repo])
  async getUserRepositories(@Arg("username") username: string): Promise<Repo[]> {
    const repoRepo = dataSource.getRepository(Repo);
    const userRepo = dataSource.getRepository(User);
  
    const user = await userRepo.findOne({
      where: { username },
      select: ["u_id", "username", "githubAccessToken"],
    });
  
    if (!user || !user.githubAccessToken) {
      throw new Error("User not found or GitHub access token is missing!");
    }
  
    const GITHUB_TOKEN = user.githubAccessToken;
  
    const response = await fetch(`${GITHUB_API_URL}/users/${username}/repos`, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
  
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`GitHub API error: ${errorData.message}`);
    }
  
    const repos = await response.json();
  
    const repoDetails = await Promise.all(
      repos.map(async (repo: any) => {
        const commitsResponse = await fetch(repo.commits_url.replace("{/sha}", ""), {
          headers: { Authorization: `token ${GITHUB_TOKEN}` },
        });
  
        const commits = await commitsResponse.json();
        const totalCommits = Array.isArray(commits) ? commits.length : 0;
  
        // Find existing repo by name and owner ID
        let existingRepo = await repoRepo.findOne({ 
          where: { 
            name: repo.name, 
            owner: { u_id: user.u_id } 
          },
          relations: ["owner"]
        });
  
        if (existingRepo) {
          existingRepo.language = repo.language || "-";
          existingRepo.stars = repo.stargazers_count || 0;
          existingRepo.totalCommits = totalCommits;
          await repoRepo.save(existingRepo);
          return existingRepo;
        } else {
          const newRepo = repoRepo.create({
            name: repo.name,
            owner: user,  
            language: repo.language || "-",
            stars: repo.stargazers_count || 0,
            totalCommits,
          });
  
          await repoRepo.save(newRepo);
          return newRepo;
        }
      })
    );
  
    return repoDetails;
  }
}