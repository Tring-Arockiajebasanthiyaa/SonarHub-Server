import { buildSchema } from "type-graphql";
import { GraphQLJSONObject } from 'graphql-type-json';
import { AuthResolver } from "./modules/user/resolvers/authResolver"; 
import { AnalysisResult } from "./modules/SonarIssues/graphql/types/AnalysisResult";
import {UserResolver} from "./modules/user/userId/resolver/userResolver";
import {SonarQubeResolver} from "./modules/SonarIssues/resolver/SonarQubeResolver";
import { GitHubResolver } from "./modules/GitHubRepository/resolver/GitHubResolver";
import { UserNameResolver} from "./modules/userName/resolver/userNameResolver";
import {ProjectResolver} from "./modules/Project/resolver/ProjectResolver";
import { LocReport } from "./modules/SonarIssues/graphql/types/LocReport";
import { GraphQLScalarType } from "graphql/type";
import { PullRequestResolver } from "./modules/PullRequest/resolver/pullRequestResolver";
import { UserActivityResolver } from "./modules/UserActivity/resolver/UserActivityResolver"
import { BranchResolver } from "./modules/branch/resolver/branchResolver";
import { TriggerPullRequestResolver } from "./modules/TriggerAnalysis/resolver/triggerPullRequestsAnalysis";
import { RequestGithubAuthResolver } from "./modules/RequestGithubAuthResponse/resolver/RequestGithubAuthResolver";
import { FetchPrivateReposResolver } from "./modules/FetchPrivateRepos/resolver/FetchPrivateReposResolver";
export const schema = async () =>
  await buildSchema({
    resolvers: [AuthResolver,UserResolver,SonarQubeResolver,GitHubResolver,UserActivityResolver, UserNameResolver,ProjectResolver,PullRequestResolver,BranchResolver,TriggerPullRequestResolver,RequestGithubAuthResolver,FetchPrivateReposResolver], 
    emitSchemaFile: true,
    validate: false, orphanedTypes: [AnalysisResult, LocReport],
    scalarsMap: [{ 
      type: Object, 
      scalar: GraphQLJSONObject as unknown as GraphQLScalarType 
    }],
  });
