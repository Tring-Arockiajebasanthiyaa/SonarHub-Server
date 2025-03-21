import { buildSchema } from "type-graphql";
import { AuthResolver } from "./modules/user/resolvers/authResolver";
import { QueryResolver } from "./modules/user/resolvers/queryResolver";  
import { ProjectResolver } from "./modules/user/resolvers/projectResolver";
export const schema = async () =>
  await buildSchema({
    resolvers: [AuthResolver, QueryResolver,ProjectResolver], 
    validate: false,
  });
