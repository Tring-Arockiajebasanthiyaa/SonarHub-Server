import { InputType, Field } from "type-graphql";

@InputType()
export class SonarIssueInput {
  @Field()
  issueType!: string;

  @Field()
  severity!: string;

  @Field()
  message!: string;

  @Field()
  rule!: string;

  @Field()
  component!: string;
}
