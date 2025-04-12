import { Resolver, Query, Arg } from "type-graphql";
import { User } from "../../entity/user.entity";
import dataSource from "../../../../database/data-source";

@Resolver()
export class UserResolver {
  @Query(() => User, { nullable: true })
  async getUser(@Arg("username") username: string): Promise<User | null> {
    const userRepo = dataSource.getRepository(User);
    return userRepo.findOne({ where: { username } });
  }
}
