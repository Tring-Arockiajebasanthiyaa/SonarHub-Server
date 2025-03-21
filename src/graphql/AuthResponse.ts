import { ObjectType, Field } from "type-graphql";
import { User } from "../modules/user/entity/user.entity"; // Ensure correct import
import "reflect-metadata";

@ObjectType()
export class AuthResponse {
  @Field()
  isAuthenticated?: boolean;

  @Field(() => User, { nullable: true })
  user?: User | null;

  @Field(() => String, { nullable: true }) 
  token?: string | null;
}


