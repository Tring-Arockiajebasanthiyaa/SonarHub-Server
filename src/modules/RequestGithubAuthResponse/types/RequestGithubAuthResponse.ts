import { Field, ObjectType } from "type-graphql";

@ObjectType()
export class RequestGithubAuthResponse {
  @Field()
  success!: boolean;

  @Field()
  url!: string;

  @Field()
  message!: string;
}
