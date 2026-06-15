"use client";

import { LoaderCircle, Send } from "lucide-react";

export type ChatMessage = {
  role: "user" | "shield" | "villain" | "coach" | "debrief" | "system";
  content: string;
  meta?: string;
};

type ShieldChatProps = {
  messages: ChatMessage[];
  userInput: string;
  isSending: boolean;
  chatError: string | null;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
};

export function ShieldChat({
  messages,
  userInput,
  isSending,
  chatError,
  onInputChange,
  onSubmit,
}: ShieldChatProps) {
  return (
    <div className="chat-shell">
      <div className="message-list">
        {messages.map((message, index) => (
          <div className={`message ${message.role}-message`} key={`${message.role}-${index}`}>
            <b>{message.role === "user" ? "你" : roleLabel(message.role)}</b>
            {message.meta ? <small>{message.meta}</small> : null}
            <p>{message.content}</p>
          </div>
        ))}
        {isSending ? (
          <div className="message system-message">
            <b>系统</b>
            <p>
              <LoaderCircle className="spin" size={16} /> 正在请求模型接口...
            </p>
          </div>
        ) : null}
      </div>
      {chatError ? <div className="inline-error">{chatError}</div> : null}
      <form
        className="reply-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <textarea
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="和盾牌聊聊感受。练习需先完成知情同意，再进入坏蛋模式。"
          rows={3}
          value={userInput}
        />
        <button disabled={!userInput.trim() || isSending} type="submit">
          <Send size={16} />
          发送
        </button>
      </form>
    </div>
  );
}

function roleLabel(role: ChatMessage["role"]) {
  if (role === "shield") return "盾牌";
  if (role === "villain") return "坏蛋陪练";
  if (role === "coach") return "引导教练";
  if (role === "debrief") return "复盘";
  return "系统";
}
