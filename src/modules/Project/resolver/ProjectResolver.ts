import { Resolver, Query, Mutation, Arg } from "type-graphql";
import { Project } from "../entity/project.entity";
import dataSource from "../../../database/data-source";

@Resolver(Project)
export class ProjectResolver {
  private projectRepo = dataSource.getRepository(Project);

  @Query(() => [Project])
  async getProjects(): Promise<Project[]> {
    return await this.projectRepo.find({ relations: ["sonarIssues"] });
  }

  @Mutation(() => Project)
async createProject(
  @Arg("title") title: string,
  @Arg("description") description: string,
  @Arg("overview") overview: string,
  @Arg("result") result: string
): Promise<Project> {
  const project = this.projectRepo.create({
    title,
    description,
    overview,
    result
  });

  return await this.projectRepo.save(project);
}

}
