import { buildSchema } from "type-graphql";
import { AuthResolver } from "./modules/user/resolvers/authResolver";
import { QueryResolver } from "./modules/user/resolvers/queryResolver";  
import { ScanResultResolver } from "./modules/user/resolvers/scanResolver";
import {UserResolver} from "./modules/user/UserName/resolver/UserResolver";
import {SonarQubeResolver} from "./modules/SonarIssues/resolver/SonarQubeResolver";
import { GitHubResolver } from "./modules/user/resolvers/GitHubResolver";
import{UserActivityResolver} from "./modules/UserActivity/resolver/UserActivityResolver";
import { UserNameResolver} from "./modules/UserName/resolver/UserNameResolver"
export const schema = async () =>
  await buildSchema({
    resolvers: [AuthResolver, QueryResolver,ScanResultResolver,UserResolver,SonarQubeResolver,GitHubResolver,UserActivityResolver, UserNameResolver], 
    validate: false,
  });
