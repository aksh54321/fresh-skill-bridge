export async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(path, {
      ...options,
      credentials: "include",
      signal: controller.signal,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });

    if (response.status === 204) return null;

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status}).`);
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The request timed out. Check the API connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchWorkspace(user, date) {
  const requests = [
    apiRequest("/api/employees"),
    apiRequest(`/api/attendance?date=${encodeURIComponent(date)}`),
    apiRequest("/api/leaves"),
    apiRequest("/api/announcements"),
    apiRequest("/api/trainings"),
    apiRequest("/api/notifications"),
  ];
  if (user.role === "HR") requests.push(apiRequest("/api/payroll"));
  const [employees, attendance, leaves, announcements, trainings, notifications, payroll] =
    await Promise.all(requests);

  return {
    employees: employees.employees || [],
    attendance: (attendance.attendance || []).reduce((result, record) => {
      result[`${record.date}-${record.employeeId}`] = record.status;
      return result;
    }, {}),
    leaveRequests: leaves.leaveRequests || [],
    announcements: announcements.announcements || [],
    trainings: trainings.trainings || [],
    notifications: notifications.notifications || [],
    payroll: payroll?.payroll || [],
  };
}
