import { Resolver, Query, Arg } from "type-graphql";
import { ScanResult } from "../entity/scanResult.entity";
import dataSource from "../../../database/data-source"; // Import your data source

@Resolver()
export class ScanResultResolver {
  @Query(() => [ScanResult])
  async getUserScanResults(@Arg("username") username: string): Promise<ScanResult[]> {
    const scanRepo = dataSource.getRepository(ScanResult); 
    return await scanRepo.find({ 
      where: { user: { username } }, 
      order: { timestamp: "DESC" } 
    });
  }
}
