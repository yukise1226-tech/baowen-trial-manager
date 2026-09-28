/* ============================================================
 * 纯函数 revision compare-and-set（无 Workers 运行时依赖，可直接单元测试）
 *
 * 设计原则：revision 的判断与推进只在服务端 Durable Object 内完成，
 * 客户端只提交 baseRevision + 完整 state，绝不自行计算新 revision。
 * ============================================================ */

export function buildEnvelope(schemaVersion, revision, updatedAt, deviceId, state) {
  return {
    app: "保温试验排程工具",
    syncVersion: 1,
    metadata: { schemaVersion, revision, updatedAt, deviceId },
    state,
  };
}

/* 对当前 envelope 应用一次上传请求。
 * current：当前云端 envelope（null 表示空云端）
 * body：{ baseRevision, schemaVersion, deviceId, state }
 * updatedAt：服务端生成的时间（ISO 字符串）
 * 返回：
 *   { status:"ok", envelope, metadata }               —— 可落盘
 *   { status:"conflict", metadata }                   —— 409，不写入任何数据
 *   { status:"bad_request", error }                   —— 400
 */
export function applyCas(current, body, updatedAt) {
  const schemaVersion = body && body.schemaVersion;
  const state = body && body.state;
  const deviceId = String((body && body.deviceId) || "");
  const baseRevision = Number(body && body.baseRevision);

  if (schemaVersion !== 6 || !state || typeof state !== "object" || state.schemaVersion !== 6) {
    return { status: "bad_request", error: "只接受 schemaVersion 6 数据" };
  }
  if (!Number.isInteger(baseRevision) || baseRevision < 0) {
    return { status: "bad_request", error: "baseRevision 必须是 >=0 的整数" };
  }

  const currentRevision = current ? current.metadata.revision : 0;
  if (baseRevision !== currentRevision) {
    return {
      status: "conflict",
      metadata: current
        ? current.metadata
        : { schemaVersion: 6, revision: 0, updatedAt: "", deviceId: "" },
    };
  }

  const envelope = buildEnvelope(6, currentRevision + 1, updatedAt, deviceId, state);
  return { status: "ok", envelope, metadata: envelope.metadata };
}
