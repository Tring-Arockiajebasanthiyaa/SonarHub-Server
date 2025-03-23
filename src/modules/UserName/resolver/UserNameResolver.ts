import { Resolver, Query, Arg } from "type-graphql";
import { User } from "../../user/entity/user.entity";
import dataSource from "../../../database/data-source";

@Resolver(User)
export class UserNameResolver {
  @Query(() => User, { nullable: true })
  async getUserByEmail(@Arg("email") email: string): Promise<User | null> {
    console.log("Searching for user with email:", email);
    
    const user = await dataSource.getRepository(User).findOne({ where: { email } });
  
    console.log("Found user:", user); // Check if a user is returned
    return user;
  }
  
}
