import { Branch } from "../entity/branch.entity";
import { Resolver, Query, Arg} from "type-graphql";
import dataSource from "../../../database/data-source";
import dotenv from "dotenv";
import axios from "axios";
import { User } from "../../user/entity/user.entity";
dotenv.config();


const GITHUB_API_URL = process.env.GITHUB_API;
@Resolver()
export class BranchResolver {
  @Query(() => [Branch])
  async getBranchesByUsernameAndRepo(
    @Arg("githubUsername") githubUsername: string,
    @Arg("repoName") repoName: string
  ): Promise<Branch[]> {
    const userRepo = dataSource.getRepository(User);
 
    
    const user = await userRepo.findOneOrFail({
      where: { username: githubUsername },
    });
 
    const response = await axios.get(
      `${GITHUB_API_URL}/repos/${githubUsername}/${repoName}/branches`,
      {
        headers: {
          Authorization: `Bearer ${user.githubAccessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
 
   
    const branches: Branch[] = response.data.map((branch: any) => ({
      name: branch.name,
      repoName,
      username: githubUsername,
    }));
    
    return branches;
  }
 
 
}
