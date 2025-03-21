import { Query, Resolver } from "type-graphql";

@Resolver()
export class QueryResolver {
  @Query(() => String)
  apiStatus(): string {
    return "GraphQL API is working!";
  }
}

export default QueryResolver; 