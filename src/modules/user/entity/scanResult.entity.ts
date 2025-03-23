import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";
import { ObjectType, Field, ID } from "type-graphql";
import { User } from "../entity/user.entity";

@Entity({ name: "scan_results" })
@ObjectType()
export class ScanResult {
  @PrimaryGeneratedColumn("uuid")
  @Field(() => ID)
  id!: string;

  @ManyToOne(() => User, (user) => user.username, { eager: true })
  @Field(() => User)
  user!: User;

  @Column()
  @Field()
  totalBugs!: number;

  @Column()
  @Field()
  vulnerabilities!: number;

  @Column()
  @Field()
  codeSmells!: number;

  @Column()
  @Field()
  duplications!: number;

  @Column()
  @Field()
  timestamp!: Date;
}
