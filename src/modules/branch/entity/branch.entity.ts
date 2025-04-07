import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { ObjectType, Field } from "type-graphql";
import { Repo } from "../../GitHubRepository/entity/Repo.entity";
import { User } from "../../user/entity/user.entity"; 

@ObjectType()
@Entity("branches")
export class Branch {
  @Field()
  @PrimaryGeneratedColumn()
  id!: number;

  @Field()
  @Column()
  name!: string;

  @Field()
  @Column()
  repoName!: string;

  @Field()
  @Column()
  username!: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  dashboardUrl?: string;

  @Field()
  @Column()
  repoId!: number;

  @ManyToOne(() => Repo, { nullable: false })
  @JoinColumn({ name: "repoId", referencedColumnName: "id" }) 
  repo!: Repo;

  @ManyToOne(() => User, (user) => user.username, { nullable: false })
  @JoinColumn({ name: "username", referencedColumnName: "username" }) 
  user!: User;
}
