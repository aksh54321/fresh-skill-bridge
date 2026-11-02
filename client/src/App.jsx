
import { useEffect, useState } from "react";
import "./App.css";

function readStoredValue(key, fallback) {
  try {
    const storedValue = window.localStorage.getItem(key);
    return storedValue === null ? fallback : JSON.parse(storedValue);
  } catch {
    return fallback;
  }
}

function App() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [attendance, setAttendance] = useState({});
  const [leaveRequests, setLeaveRequests] = useState(() =>
    readStoredValue("staffsync.leaveRequests", [])
  );
  const [payroll, setPayroll] = useState(() =>
    readStoredValue("staffsync.payroll", [])
  );
  const [dashboardOverview, setDashboardOverview] = useState(() =>
    readStoredValue(
      "staffsync.dashboardOverview",
      "Review today's attendance, leave activity, and payroll at a glance."
    )
  );
  const [dashboardDraft, setDashboardDraft] = useState(dashboardOverview);
  const [editingOverview, setEditingOverview] = useState(false);
  const [settings, setSettings] = useState(() =>
    readStoredValue("staffsync.settings", {
      companyName: "StaffSync",
      companyInfo: "HR Management System",
      currency: "INR",
    })
  );
  const [settingsDraft, setSettingsDraft] = useState(settings);
  const [editingLeaveId, setEditingLeaveId] = useState(null);

const [payrollForm, setPayrollForm] = useState({
  employeeId: "",
  salary: "",
  bonus: 0,
  deductions: 0,
  paymentStatus: "Pending",
});

const [leaveForm, setLeaveForm] = useState({
  employeeId: "",
  startDate: "",
  endDate: "",
  reason: "",
});
const [attendanceDate, setAttendanceDate] = useState(
  new Date().toISOString().split("T")[0]
);

  useEffect(() => {
    window.localStorage.setItem("staffsync.leaveRequests", JSON.stringify(leaveRequests));
  }, [leaveRequests]);

  useEffect(() => {
    window.localStorage.setItem("staffsync.payroll", JSON.stringify(payroll));
  }, [payroll]);

  useEffect(() => {
    window.localStorage.setItem("staffsync.dashboardOverview", JSON.stringify(dashboardOverview));
  }, [dashboardOverview]);

  useEffect(() => {
    window.localStorage.setItem("staffsync.settings", JSON.stringify(settings));
  }, [settings]);

  const [employees, setEmployees] = useState([
    {
      id: 1,
      name: "Akash Sharma",
      department: "Engineering",
      designation: "Software Engineer",
      email: "akash@company.com",
    },
    {
      id: 2,
      name: "Priya Verma",
      department: "Human Resources",
      designation: "HR Manager",
      email: "priya@company.com",
    },
    {
      id: 3,
      name: "Rahul Singh",
      department: "Finance",
      designation: "Accountant",
      email: "rahul@company.com",
    },
  ]);

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [newEmployee, setNewEmployee] = useState({
    name: "",
    department: "",
    designation: "",
    email: "",
  });

  const menu = [
    "Dashboard",
    "Employees",
    "Attendance",
    "Leave Management",
    "Payroll",
    "Settings",
  ];

  const addEmployee = (e) => {
  e.preventDefault();

  if (editId !== null) {
    setEmployees(
      employees.map((employee) =>
        employee.id === editId
          ? { ...employee, ...newEmployee }
          : employee
      )
    );

    setEditId(null);
  } else {
    const employee = {
      ...newEmployee,
      id: Date.now(),
    };

    setEmployees([...employees, employee]);
  }

  setNewEmployee({
    name: "",
    department: "",
    designation: "",
    email: "",
  });

  setShowForm(false);
};

  const [editId, setEditId] = useState(null);

const editEmployee = (employee) => {
  setNewEmployee({
    name: employee.name,
    department: employee.department,
    designation: employee.designation,
    email: employee.email,
  });

  setEditId(employee.id);
  setShowForm(true);
};

const deleteEmployee = (id) => {
  setEmployees(employees.filter((employee) => employee.id !== id));
};
const markAttendance = (employeeId, status) => {
  setAttendance((prev) => ({
    ...prev,
    [`${attendanceDate}-${employeeId}`]: status,
  }));
};
const applyLeave = (e) => {
  e.preventDefault();

  const employee = employees.find(
    (emp) => emp.id === Number(leaveForm.employeeId)
  );

  if (!employee) return;

  const request = {
    id: editingLeaveId ?? Date.now(),
    employeeId: employee.id,
    employeeName: employee.name,
    startDate: leaveForm.startDate,
    endDate: leaveForm.endDate,
    reason: leaveForm.reason,
  };

  setLeaveRequests((prev) => {
    if (editingLeaveId !== null) {
      return prev.map((item) =>
        item.id === editingLeaveId ? { ...item, ...request } : item
      );
    }

    return [...prev, { ...request, status: "Pending" }];
  });

  setEditingLeaveId(null);
  setLeaveForm({
    employeeId: "",
    startDate: "",
    endDate: "",
    reason: "",
  });
};
const updateLeaveStatus = (id, status) => {
  setLeaveRequests((prev) =>
    prev.map((request) =>
      request.id === id
        ? { ...request, status }
        : request
    )
  );
};
const savePayroll = (e) => {
  e.preventDefault();

  const employee = employees.find(
    (emp) => emp.id === Number(payrollForm.employeeId)
  );

  if (!employee) return;

  const salaryRecord = {
    id: Number(payrollForm.employeeId),
    employeeId: Number(payrollForm.employeeId),
    employeeName: employee.name,
    salary: Number(payrollForm.salary),
    bonus: Number(payrollForm.bonus),
    deductions: Number(payrollForm.deductions),
    paymentStatus: payrollForm.paymentStatus,
  };

  setPayroll((prev) => {
    const exists = prev.some(
      (item) => item.employeeId === salaryRecord.employeeId
    );

    if (exists) {
      return prev.map((item) =>
        item.employeeId === salaryRecord.employeeId
          ? salaryRecord
          : item
      );
    }

    return [...prev, salaryRecord];
  });

  setPayrollForm({
    employeeId: "",
    salary: "",
    bonus: 0,
    deductions: 0,
    paymentStatus: "Pending",
  });
};

const deletePayroll = (id) => {
  setPayroll((prev) =>
    prev.filter((item) => item.employeeId !== id)
  );
};

  const filteredEmployees = employees.filter((employee) =>
    employee.name.toLowerCase().includes(search.toLowerCase())
  );
  const today = new Date().toISOString().split("T")[0];
  const presentToday = employees.filter(
    (employee) => attendance[`${today}-${employee.id}`] === "Present"
  ).length;
  const employeesOnLeave = leaveRequests.filter(
    (request) =>
      request.status === "Approved" &&
      request.startDate <= today &&
      request.endDate >= today
  ).length;
  const monthlyNetPayroll = payroll.reduce(
    (total, item) => total + item.salary + item.bonus - item.deductions,
    0
  );
  const formatCurrency = (amount) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: settings.currency,
    }).format(amount);

  const saveSettings = (e) => {
    e.preventDefault();
    setSettings(settingsDraft);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>StaffSync</h2>
        <p className="subtitle">HR Management System</p>

        <nav>
          {menu.map((item) => (
            <button
              key={item}
              className={activeTab === item ? "active" : ""}
              onClick={() => setActiveTab(item)}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header>
          <h1>{activeTab}</h1>
          <p>Welcome back! Here's your workforce overview.</p>
        </header>

        <section className="stats">
          <div className="card">
            <h3>Total Employees</h3>
            <h2>{employees.length}</h2>
          </div>

          <div className="card">
            <h3>Present Today</h3>
            <h2>{presentToday}</h2>
          </div>

          <div className="card">
            <h3>On Leave</h3>
            <h2>{employeesOnLeave}</h2>
          </div>

          <div className="card">
            <h3>Monthly Net Payroll</h3>
            <h2>{formatCurrency(monthlyNetPayroll)}</h2>
          </div>
        </section>

        {activeTab === "Dashboard" ? (
          <section className="content">
            <div className="card">
              <h2>Dashboard Overview</h2>
              {editingOverview ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setDashboardOverview(dashboardDraft);
                    setEditingOverview(false);
                  }}
                >
                  <textarea
                    required
                    rows="4"
                    value={dashboardDraft}
                    onChange={(e) => setDashboardDraft(e.target.value)}
                  />
                  <button type="submit">Save Overview</button>
                  <button
                    type="button"
                    onClick={() => {
                      setDashboardDraft(dashboardOverview);
                      setEditingOverview(false);
                    }}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <p>{dashboardOverview}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setDashboardDraft(dashboardOverview);
                      setEditingOverview(true);
                    }}
                  >
                    Edit Overview
                  </button>
                </>
              )}
            </div>
          </section>
        ) : activeTab === "Employees" ? (
          <section className="content">
            <div className="employee-header">
              <h2>Employee Directory</h2>

              <button onClick={() => setShowForm(!showForm)}>
                {showForm ? "Cancel" : editId !== null ? "Update Employee" : "+ Add Employee"}
              </button>
            </div>

            {showForm && (
              <form onSubmit={addEmployee} className="employee-form">
                <input
                  placeholder="Full Name"
                  required
                  value={newEmployee.name}
                  onChange={(e) =>
                    setNewEmployee({
                      ...newEmployee,
                      name: e.target.value,
                    })
                  }
                />

                <input
                  placeholder="Department"
                  required
                  value={newEmployee.department}
                  onChange={(e) =>
                    setNewEmployee({
                      ...newEmployee,
                      department: e.target.value,
                    })
                  }
                />

                <input
                  placeholder="Designation"
                  required
                  value={newEmployee.designation}
                  onChange={(e) =>
                    setNewEmployee({
                      ...newEmployee,
                      designation: e.target.value,
                    })
                  }
                />

                <input
                  type="email"
                  placeholder="Email"
                  required
                  value={newEmployee.email}
                  onChange={(e) =>
                    setNewEmployee({
                      ...newEmployee,
                      email: e.target.value,
                    })
                  }
                />

                <button type="submit">Save Employee</button>
              </form>
            )}

            <input
              className="search"
              placeholder="Search employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Email</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.name}</td>
                    <td>{employee.department}</td>
                    <td>{employee.designation}</td>
                    <td>{employee.email}</td>
                    <td>
                      <button
  onClick={() => editEmployee(employee)}
>
  Edit
</button>

<button
  className="delete"
  onClick={() => deleteEmployee(employee.id)}
>
  Delete
</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : activeTab === "Attendance" ? (
  <section className="content">
    <div className="card">
      <h2>Attendance Management</h2>

      <label>Select Date</label>
      <input
        type="date"
        value={attendanceDate}
        onChange={(e) => setAttendanceDate(e.target.value)}
      />

      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Department</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          {employees.map((employee) => {
            const key = `${attendanceDate}-${employee.id}`;

            return (
              <tr key={employee.id}>
                <td>{employee.name}</td>
                <td>{employee.department}</td>

                <td>
                  <select
                    value={attendance[key] || ""}
                    onChange={(e) =>
                      markAttendance(employee.id, e.target.value)
                    }
                  >
                    <option value="">Select Status</option>
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                    <option value="Half Day">Half Day</option>
                    <option value="On Leave">On Leave</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </section>
        ) : activeTab === "Payroll" ? (
    <section className="content">
        <div className="card">
            <h2>Payroll Management</h2>

      <form onSubmit={savePayroll} className="employee-form">

        <select
          required
          value={payrollForm.employeeId}
          onChange={(e) => {
            const selectedId = e.target.value;

            const existing = payroll.find(
              (item) =>
                item.employeeId === Number(selectedId)
            );

            setPayrollForm({
              employeeId: selectedId,
              salary: existing?.salary || "",
              bonus: existing?.bonus || 0,
              deductions: existing?.deductions || 0,
              paymentStatus: existing?.paymentStatus || "Pending",
            });
          }}
        >
          <option value="">Select Employee</option>

          {employees.map((employee) => (
            <option
              key={employee.id}
              value={employee.id}
            >
              {employee.name}
            </option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Monthly Salary"
          required
          min="0"
          value={payrollForm.salary}
          onChange={(e) =>
            setPayrollForm({
              ...payrollForm,
              salary: e.target.value,
            })
          }
        />

        <input
          type="number"
          placeholder="Bonus"
          min="0"
          value={payrollForm.bonus}
          onChange={(e) =>
            setPayrollForm({
              ...payrollForm,
              bonus: e.target.value,
            })
          }
        />

        <input
          type="number"
          placeholder="Deductions"
          min="0"
          value={payrollForm.deductions}
          onChange={(e) =>
            setPayrollForm({
              ...payrollForm,
              deductions: e.target.value,
            })
          }
        />

        <select
          value={payrollForm.paymentStatus}
          onChange={(e) =>
            setPayrollForm({
              ...payrollForm,
              paymentStatus: e.target.value,
            })
          }
        >
          <option value="Pending">Pending</option>
          <option value="Paid">Paid</option>
          <option value="On Hold">On Hold</option>
        </select>

        <button type="submit">
          Save Payroll
        </button>

      </form>
    </div>

    <div className="card">
      <h2>Employee Salary Records</h2>

      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Salary</th>
            <th>Bonus</th>
            <th>Deductions</th>
            <th>Net Salary</th>
            <th>Payment Status</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          {payroll.map((item) => (
            <tr key={item.employeeId}>
              <td>{item.employeeName}</td>
              <td>{formatCurrency(item.salary)}</td>
              <td>{formatCurrency(item.bonus)}</td>
              <td>{formatCurrency(item.deductions)}</td>
              <td>{formatCurrency(item.salary + item.bonus - item.deductions)}</td>
              <td>{item.paymentStatus || "Pending"}</td>

              <td>
                <button
                  type="button"
                  onClick={() => {
                    setPayrollForm({
                      employeeId: String(item.employeeId),
                      salary: item.salary,
                      bonus: item.bonus,
                      deductions: item.deductions,
                      paymentStatus: item.paymentStatus || "Pending",
                    });
                  }}
                >
                  Edit
                </button>

                <button
                  type="button"
                  className="delete"
                  onClick={() =>
                    deletePayroll(item.employeeId)
                  }
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>

  </section>
    ) : activeTab === "Leave Management" ? (
<section className="content">
    <div className="card">
      <h2>Leave Management</h2>

      <form onSubmit={applyLeave} className="employee-form">
        <select
          required
          value={leaveForm.employeeId}
          onChange={(e) =>
            setLeaveForm({
              ...leaveForm,
              employeeId: e.target.value,
            })
          }
        >
          <option value="">Select Employee</option>

          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>

        <label>Start Date</label>
        <input
          type="date"
          required
          value={leaveForm.startDate}
          onChange={(e) =>
            setLeaveForm({
              ...leaveForm,
              startDate: e.target.value,
            })
          }
        />

        <label>End Date</label>
        <input
          type="date"
          required
          min={leaveForm.startDate}
          value={leaveForm.endDate}
          onChange={(e) =>
            setLeaveForm({
              ...leaveForm,
              endDate: e.target.value,
            })
          }
        />

        <input
          type="text"
          placeholder="Reason for leave"
          required
          value={leaveForm.reason}
          onChange={(e) =>
            setLeaveForm({
              ...leaveForm,
              reason: e.target.value,
            })
          }
        />

        <button type="submit">
          {editingLeaveId === null ? "Apply Leave" : "Save Leave Request"}
        </button>
        {editingLeaveId !== null && (
          <button
            type="button"
            onClick={() => {
              setEditingLeaveId(null);
              setLeaveForm({
                employeeId: "",
                startDate: "",
                endDate: "",
                reason: "",
              });
            }}
          >
            Cancel
          </button>
        )}
      </form>
    </div>

    <div className="card">
      <h2>Leave Requests</h2>

      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>From</th>
            <th>To</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          {leaveRequests.map((request) => (
            <tr key={request.id}>
              <td>{request.employeeName}</td>
              <td>{request.startDate}</td>
              <td>{request.endDate}</td>
              <td>{request.reason}</td>
              <td>
                <select
                  value={request.status}
                  onChange={(e) => updateLeaveStatus(request.id, e.target.value)}
                >
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </td>

              <td>
                <button
                  type="button"
                  onClick={() => {
                    setEditingLeaveId(request.id);
                    setLeaveForm({
                      employeeId: String(request.employeeId),
                      startDate: request.startDate,
                      endDate: request.endDate,
                      reason: request.reason,
                    });
                  }}
                >
                  Edit
                </button>
                {request.status === "Pending" && (
                  <>
                    <button
                      onClick={() =>
                        updateLeaveStatus(request.id, "Approved")
                      }
                    >
                      Approve
                    </button>

                    <button
                      onClick={() =>
                        updateLeaveStatus(request.id, "Rejected")
                      }
                    >
                      Reject
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
        ) : activeTab === "Settings" ? (
  <section className="content">
    <div className="card">
      <h2>Settings</h2>
      <form className="employee-form" onSubmit={saveSettings}>
        <input
          required
          placeholder="Company Name"
          value={settingsDraft.companyName}
          onChange={(e) =>
            setSettingsDraft({ ...settingsDraft, companyName: e.target.value })
          }
        />
        <textarea
          required
          rows="4"
          placeholder="Company Information"
          value={settingsDraft.companyInfo}
          onChange={(e) =>
            setSettingsDraft({ ...settingsDraft, companyInfo: e.target.value })
          }
        />
        <select
          value={settingsDraft.currency}
          onChange={(e) =>
            setSettingsDraft({ ...settingsDraft, currency: e.target.value })
          }
        >
          <option value="INR">INR - Indian Rupee</option>
          <option value="USD">USD - US Dollar</option>
          <option value="EUR">EUR - Euro</option>
          <option value="GBP">GBP - British Pound</option>
          <option value="CAD">CAD - Canadian Dollar</option>
          <option value="AUD">AUD - Australian Dollar</option>
        </select>
        <button type="submit">Save Settings</button>
        <button
          type="button"
          onClick={() => setSettingsDraft(settings)}
        >
          Cancel
        </button>
      </form>
    </div>
  </section>
) : (
  <section className="content">
    <div className="card">
      <h2>{activeTab} Overview</h2>
      <p>
        Your StaffSync workspace is ready. Select a section
        from the sidebar to explore.
      </p>
    </div>
  </section>
)}
</main>
</div>
);
}

export default App;