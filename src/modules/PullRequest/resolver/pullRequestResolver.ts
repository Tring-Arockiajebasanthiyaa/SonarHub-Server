import { Resolver, Query, Arg, Int ,Ctx} from "type-graphql";
import dataSource from "../../../database/data-source";
import { PullRequest } from "../entity/pullRequest.entity";
import { User } from "../../user/entity/user.entity";
import axios from "axios";
import MyContext from "types/MyContext";
import dotenv from "dotenv";
import { DeepPartial } from "typeorm";
dotenv.config();

const GITHUB_API_URL = process.env.GITHUB_API;

@Resolver()
export class PullRequestResolver {
  @Query(() => [PullRequest])
  async getPullRequestsByBranch(
    @Arg("branchName") branchName: string,
    @Arg("repoName") repoName: string,
    @Arg("githubUsername") githubUsername: string,
    @Ctx() ctx: MyContext
  ): Promise<PullRequest[]> {
    const prRepo = dataSource.getRepository(PullRequest);
    const userRepo = dataSource.getRepository(User);

    const user = await userRepo.findOneOrFail({ where: { username: githubUsername } });

    const response = await axios.get(
      `${GITHUB_API_URL}/repos/${githubUsername}/${repoName}/pulls?state=all`
,
      {
        headers: {
          Authorization: `Bearer ${user.githubAccessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    for (const pr of response.data) {
      const exists = await prRepo.findOne({
        where: { prId: pr.number, branch: branchName },
      });

      if (!exists && pr.head.ref === branchName) {
        const diffStatRes = await axios.get(
          `${GITHUB_API_URL}/repos/${githubUsername}/${repoName}/pulls/${pr.number}`,
          {
            headers: {
              Authorization: `Bearer ${user.githubAccessToken}`,
              Accept: "application/vnd.github.v3+json",
            },
          }
        );
        const prData: DeepPartial<PullRequest> = {
            prId: pr.number,
            title: pr.title,
            state: pr.state,
            branch: branchName,
            author: pr.user?.login || "unknown",
            githubUsername,
            createdAt: new Date(pr.created_at),
            closedAt: pr.closed_at ? new Date(pr.closed_at) : undefined,
            mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
            additions: diffStatRes.data.additions,
            deletions: diffStatRes.data.deletions,
            changedFiles: diffStatRes.data.changed_files,
          };
          
          const prEntity = prRepo.create(prData);
          
          

        await prRepo.save(prEntity);
      }
    }

    return await prRepo.find({ where: { branch: branchName } });
  }
}
