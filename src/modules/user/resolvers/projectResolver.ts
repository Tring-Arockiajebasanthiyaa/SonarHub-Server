import { Arg, Mutation, Query, Resolver } from "type-graphql";
import { Project } from "../entity/project.entity";
import dataSource from "../../../database/data-source";

@Resolver()
export class ProjectResolver {
  @Query(() => [Project])
  async getProjects(): Promise<Project[]> {
    return await dataSource.getRepository(Project).find();
  }

  @Mutation(() => Project)
  async createProject(
    @Arg("title") title: string,
    @Arg("description") description: string,
    @Arg("owner") owner: string
  ): Promise<Project> {
    const projectRepo = dataSource.getRepository(Project);
    const project = projectRepo.create({ title, description, owner });
    return await projectRepo.save(project);
  }
}
