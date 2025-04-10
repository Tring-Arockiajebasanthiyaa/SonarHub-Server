import { Arg, Mutation, Resolver,Int } from "type-graphql";
import { triggerPRAnalysis } from "../services/triggerPullRequests.service";
import { TriggerAnalysisResponse } from "../types/TriggerAnalysisResponse";

@Resolver()
export class TriggerPullRequestResolver {
  @Mutation(() => TriggerAnalysisResponse)
  async triggerAnalysis(
    @Arg("username") username: string,
    @Arg("repoName") repoName: string,
    @Arg("branchName") branchName: string,
    @Arg("prId", () => Int) prId: number
  ): Promise<TriggerAnalysisResponse> {
    try {
      const message = await triggerPRAnalysis(username, repoName, branchName, prId);
      return {
        success: true,
        message,
      };
    } catch (error: any) {
      console.error("Error triggering PR analysis:", error);
      return {
        success: false,
        message: error.message || "Unknown error",
      };
    }
  }
}
