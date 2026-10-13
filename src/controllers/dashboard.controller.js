const prisma = require('../config/prisma');

exports.getDashboard = async (req, res, next) => {
  try {
    const { id: userId, role, companyId } = req.user;
    const isPrivileged = role === 'admin' || role === 'manager';

    // Base scope: "my tasks" for employee, "all company tasks" for admin/manager
    const taskScope = isPrivileged
      ? { project: { companyId } }
      : { project: { companyId }, assignedTo: userId };

    const now = new Date();

    const [
      myTasksCount,
      overdueCount,
      completedCount,
      inProgressCount,
      totalProjectsCount,
      totalUsersCount,
      recentTasks,
      statusBreakdown,
    ] = await Promise.all([
      // Total tasks in scope
      prisma.task.count({
        where: { ...taskScope, isActive: true },
      }),

      // Overdue: due date in past, not completed, still active
      prisma.task.count({
        where: {
          ...taskScope,
          isActive: true,
          status: { not: 'COMPLETED' },
          dueDate: { lt: now },
        },
      }),

      // Completed
      prisma.task.count({
        where: { ...taskScope, isActive: true, status: 'COMPLETED' },
      }),

      // In progress
      prisma.task.count({
        where: { ...taskScope, isActive: true, status: 'IN_PROGRESS' },
      }),

      // Active projects in company
      prisma.project.count({
        where: { companyId, isActive: true },
      }),

      // Active users in company
      prisma.user.count({
        where: { companyId, isActive: true },
      }),

      // Recent 5 tasks in scope
      prisma.task.findMany({
        where: { ...taskScope, isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
        },
      }),

      // Group by status
      prisma.task.groupBy({
        by: ['status'],
        where: { ...taskScope, isActive: true },
        _count: { status: true },
      }),
    ]);

    // Shape status breakdown into { TODO: n, IN_PROGRESS: n, ... }
    const statusMap = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, COMPLETED: 0 };
    for (const row of statusBreakdown) {
      statusMap[row.status] = row._count.status;
    }

    res.json({
      scope: isPrivileged ? 'company' : 'personal',
      stats: {
        totalTasks: myTasksCount,
        overdue: overdueCount,
        completed: completedCount,
        inProgress: inProgressCount,
        totalProjects: totalProjectsCount,
        totalUsers: totalUsersCount,
      },
      statusBreakdown: statusMap,
      recentTasks: recentTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        createdAt: t.createdAt,
        project: t.project,
        assignee: t.assignee,
      })),
    });
  } catch (err) {
    next(err);
  }
};
