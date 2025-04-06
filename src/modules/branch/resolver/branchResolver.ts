import { Branch } from "../../branch/entity/branch.entity";
import { Resolver, Query, Arg, Int } from "type-graphql";
import dataSource from "../../../database/data-source";
@Resolver()
export class BranchResolver {
  @Query(() => [Branch])
  async getBranchesByRepo(
    @Arg("repoId", () => Int) repoId: number
  ): Promise<Branch[]> {
    const branchRepo = dataSource.getRepository(Branch);
    return await branchRepo.find({ where: { repoId } });
  }
}
