import { buildSchema } from "type-graphql";
import { AuthResolver } from "./modules/user/resolvers/authResolver"; 

import {UserResolver} from "./modules/user/userId/resolver/UserResolver";
import {SonarQubeResolver} from "./modules/SonarIssues/resolver/SonarQubeResolver";
import { GitHubResolver } from "./modules/GitHubRepository/resolver/GitHubResolver";
import{UserActivityResolver} from "./modules/UserActivity/resolver/userActivityResolver";
import { UserNameResolver} from "./modules/userName/resolver/userNameResolver";
import {ProjectResolver} from "./modules/Project/resolver/ProjectResolver"
export const schema = async () =>
  await buildSchema({
    resolvers: [AuthResolver,UserResolver,SonarQubeResolver,GitHubResolver,UserActivityResolver, UserNameResolver,ProjectResolver], 
    validate: false,
  });
