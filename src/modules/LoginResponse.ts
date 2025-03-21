import { ObjectType, Field } from "type-graphql";

@ObjectType()
export class LoginResponse {
  @Field()
  token!: string;

  @Field()
  name!: string;

  @Field()
  email!: string;
}
