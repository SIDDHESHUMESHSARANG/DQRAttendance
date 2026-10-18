
/**
 * Attaches pre-save hooks to the student schema
 * @param {import('mongoose').Schema} schema
 */
export const applyStudentMiddleware = (schema) => {
  schema.pre("save", function () {
    const summary = this.attendanceSummary;

    if (summary.totalSessionsConducted > 0) {
      summary.attendancePercentage = parseFloat(
        (
          (summary.totalSessionsAttended /
            summary.totalSessionsConducted) *
          100
        ).toFixed(2)
      );
    } else {
      summary.attendancePercentage = 0;
    }
  });
};
