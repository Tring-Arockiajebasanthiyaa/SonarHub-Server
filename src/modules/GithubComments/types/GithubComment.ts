import { ObjectType, Field, Int } from "type-graphql";
import 'reflect-metadata'
@ObjectType()
export class GitHubComment {
  @Field()
  id!: string;

  @Field()
  body!: string;

  @Field()
  userLogin!: string;

  @Field()
  createdAt!: string;

  @Field()
  repoName!: string;

  @Field()
  branchName!: string;

  @Field(() => Int)
  prId!: number;
}
