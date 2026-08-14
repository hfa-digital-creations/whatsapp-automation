import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { PasswordService } from '../../common/services/password.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly passwordService: PasswordService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('A user with this email already exists.');

    const tempPassword = dto.password ?? this.passwordService.generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(tempPassword);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        role: dto.role,
        passwordHash,
        status: dto.role === UserRole.CLIENT ? UserStatus.PENDING : UserStatus.ACTIVE,
        mustChangePassword: true,
      },
    });

    return { user, temporaryPassword: dto.password ? undefined : tempPassword };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async list(params: { search?: string; role?: UserRole; status?: UserStatus; skip?: number; take?: number }) {
    const { search, role, status, skip = 0, take = 25 } = params;
    const where: Prisma.UserWhereInput = {
      role,
      status,
      OR: search
        ? [
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);
    return this.prisma.user.update({ where: { id }, data: dto });
  }

  async block(id: string) {
    const user = await this.findById(id);
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('The super admin account cannot be blocked.');
    }
    return this.prisma.user.update({ where: { id }, data: { status: UserStatus.BLOCKED } });
  }

  async unblock(id: string) {
    await this.findById(id);
    return this.prisma.user.update({ where: { id }, data: { status: UserStatus.ACTIVE } });
  }

  async softDelete(id: string) {
    const user = await this.findById(id);
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('The super admin account cannot be deleted.');
    }
    await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.DELETED, deletedAt: new Date() },
    });
    await this.prisma.refreshToken.updateMany({ where: { userId: id }, data: { revoked: true } });
    return { deleted: true };
  }

  /**
   * Admin-triggered reset for staff accounts that don't have automated credential
   * delivery — the caller sees the resulting temp password directly, so resetting a
   * SUPER_ADMIN this way would let a lower-privileged admin silently take over that
   * account. Blocked here the same way block/delete already refuse SUPER_ADMIN targets;
   * a super admin who's locked out must use self-service forgot-password instead.
   */
  async resetPassword(id: string) {
    const user = await this.findById(id);
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Super admin passwords cannot be reset by another admin — use "Forgot password" instead.');
    }
    const temporaryPassword = this.passwordService.generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    await this.prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
    await this.prisma.refreshToken.updateMany({ where: { userId: id }, data: { revoked: true } });
    return { temporaryPassword };
  }
}
