import { Resolver, Arg, Query } from "type-graphql";
import axios from "axios";
import { GithubRepo } from "../types/fetchPrivateRepos";
import { User } from "../../user/entity/user.entity";
import dataSource from "../../../database/data-source";
const GITHUB_API_URL = process.env.GITHUB_API;
@Resolver()
export class FetchPrivateReposResolver {
  @Query(() => [GithubRepo])
  async fetchPrivateRepos(
    @Arg("username") username: string,
  ): Promise<GithubRepo[]> {
    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.findOneBy({ username });

    if (!user || !user.githubAccessToken) {
      throw new Error("GitHub access token not found for this user");
    }

    try {
      const reposResponse = await axios.get(
        "https://api.github.com/user/repos?visibility=private",
        {
          headers: {
            Authorization: `Bearer ${user.githubAccessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      return reposResponse.data.map((repo: any) => ({
        name: repo.name,
        private: repo.private,
        html_url: repo.html_url,
        description: repo.description,
      }));
    } catch (error: any) {
      console.error("Failed to fetch private repositories:", error.message);
      throw new Error("Unable to fetch private repositories");
    }
  }
}
