import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('api_registry')
export class ApiRegistry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  url: string;

  @Column()
  name: string;
}
