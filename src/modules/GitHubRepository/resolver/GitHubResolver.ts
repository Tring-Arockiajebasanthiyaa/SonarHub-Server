import { Resolver, Query, Arg } from "type-graphql";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { Repo } from "../entity/repo.entity";
import { User } from "../../user/entity/user.entity";
import dataSource from "../../../database/data-source";

dotenv.config();

@Resolver()
export class GitHubResolver {
  @Query(() => [Repo])
  async getUserRepositories(@Arg("username") username: string): Promise<Repo[]> {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    if (!GITHUB_TOKEN) throw new Error("GitHub token is missing!");

    const response = await fetch(`https://api.github.com/users/${username}/repos`, {
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
    const repoRepo = dataSource.getRepository(Repo);
    const userRepo = dataSource.getRepository(User);

    let user = await userRepo.findOne({ where: { username } });
    if (!user) throw new Error("User not found");

    const repoDetails = await Promise.all(
      repos.map(async (repo: any) => {
        // Fetch commit count
        const commitsResponse = await fetch(repo.commits_url.replace("{/sha}", ""), {
          headers: { Authorization: `token ${GITHUB_TOKEN}` },
        });

        const commits = await commitsResponse.json();
        const totalCommits = Array.isArray(commits) ? commits.length : 0;

       
        const newRepo = repoRepo.create({
          name: repo.name,
          owner: repo.owner.login,
          language: repo.language || "-",
          stars: repo.stargazers_count || 0,
          totalCommits,
          user,
        });

        await repoRepo.save(newRepo);
        return newRepo;
      })
    );

    return repoDetails;
  }
}
