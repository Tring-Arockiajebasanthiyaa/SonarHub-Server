import { buildSchema } from "type-graphql";
import { GraphQLJSONObject } from 'graphql-type-json';
import { AuthResolver } from "./modules/user/resolvers/authResolver"; 
import { AnalysisResult } from "./modules/SonarIssues/graphql/types/AnalysisResult";
import {UserResolver} from "./modules/user/userId/resolver/userResolver";
import {SonarQubeResolver} from "./modules/SonarIssues/resolver/SonarQubeResolver";
import { GitHubResolver } from "./modules/GitHubRepository/resolver/GitHubResolver";
import{UserActivityResolver} from "./modules/UserActivity/resolver/UserActivityResolver";
import { UserNameResolver} from "./modules/userName/resolver/userNameResolver";
import {ProjectResolver} from "./modules/Project/resolver/ProjectResolver";
import { LocReport } from "./modules/SonarIssues/graphql/types/LocReport";
import { GraphQLScalarType } from "graphql/type";
export const schema = async () =>
  await buildSchema({
    resolvers: [AuthResolver,UserResolver,SonarQubeResolver,GitHubResolver,UserActivityResolver, UserNameResolver,ProjectResolver], 
    validate: false, orphanedTypes: [AnalysisResult, LocReport],
    scalarsMap: [{ 
      type: Object, 
      scalar: GraphQLJSONObject as unknown as GraphQLScalarType 
    }],
  });
