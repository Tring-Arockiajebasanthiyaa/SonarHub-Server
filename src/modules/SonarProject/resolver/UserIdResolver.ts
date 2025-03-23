import { Resolver, Query, Arg, ObjectType, Field } from "type-graphql";
import { User } from "../../user/entity/user.entity";
import dataSource from "../../../database/data-source";
@ObjectType()
class UserResponse {
  @Field()
  u_uid!: string;

  @Field()
  githubUsername!: string;
}

@Resolver()
export class UserResolver {
  @Query(() => UserResponse, { nullable: true })
  async getUserByEmail(@Arg("email") email: string): Promise<UserResponse | null> {
    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { email } });

    if (!user) return null;

    return {
      u_uid: user.u_id,
      githubUsername: user.username,
    };
  }
}
