import { Field, ObjectType } from "type-graphql";

@ObjectType()
export class GithubRepo {
  @Field(() => String)
  name!: string;

  @Field(() => Boolean)
  private!: boolean;

  @Field(() => String)
  html_url!: string;

  @Field(() => String, { nullable: true })
  description?: string;
}
