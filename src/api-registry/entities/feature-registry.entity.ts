import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { ApiRegistry } from '../api-registry.entity';
import { EndpointRegistry } from './endpoint-registry.entity';

@Entity('feature_registry')
export class FeatureRegistry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @ManyToOne(() => ApiRegistry, api => api.features, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'apiRegistryId' })
  apiRegistry: ApiRegistry;

  @OneToMany(() => EndpointRegistry, endpoint => endpoint.featureRegistry, { cascade: true, onDelete: 'CASCADE' })
  endpoints: EndpointRegistry[];
}
