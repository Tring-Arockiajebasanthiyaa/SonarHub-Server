import { Resolver, Query, Arg, ObjectType, Field } from "type-graphql";
import fetch from "node-fetch";
import dotenv from "dotenv";
import dataSource from "../../../database/data-source";
dotenv.config();

@ObjectType()
class Repo {
  @Field()
  name!: string;

  @Field()
  owner!: string;
}

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

    const data = await response.json();
    return data.map((repo: any) => ({
      name: repo.name,
      owner: repo.owner.login,
    }));
  }
}
