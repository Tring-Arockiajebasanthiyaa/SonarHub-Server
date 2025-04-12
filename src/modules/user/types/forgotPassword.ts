import { ObjectType, Field } from "type-graphql";
@ObjectType()
export class ForgotPasswordResponse {
  @Field()
  message!: string;

  @Field()
  token!: string;
}
