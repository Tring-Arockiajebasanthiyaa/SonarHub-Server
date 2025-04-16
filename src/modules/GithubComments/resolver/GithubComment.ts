import { Arg, Query, Resolver, Int } from "type-graphql";
import { GitHubComment } from "../types/GithubComment";
import axios from "axios";
import dotenv from "dotenv";
import dataSource from "../../../database/data-source";
import { User } from "../../user/entity/user.entity";

dotenv.config();
const GITHUB_API_URL = process.env.GITHUB_API;

@Resolver()
export class GitHubCommentResolver {
  @Query(() => [GitHubComment])
  async getPRComments(
    @Arg("username") username: string,
    @Arg("repoName") repoName: string,
    @Arg("prId", () => Int) prId: number,
  ): Promise<GitHubComment[]> {
    const userRepository = dataSource.getRepository(User);
    const user = await userRepository.findOne({
      where: { username },
      select: ["githubAccessToken"],
    });

    if (!user || !user.githubAccessToken) {
      throw new Error("GitHub token not found for this user.");
    }

    const response = await axios.get(
      `${GITHUB_API_URL}/repos/${username}/${repoName}/issues/${prId}/comments`,
      {
        headers: {
          Authorization: `token ${user.githubAccessToken}`,
          Accept: "application/vnd.github+json",
        },
      },
    );

    return response.data.map((comment: any) => ({
      id: comment.id.toString(),
      body: comment.body,
      userLogin: comment.user.login,
      createdAt: comment.created_at,
    }));
  }
}
