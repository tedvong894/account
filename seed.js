// 默认种子数据：账本 + 分类（模仿有鱼记账）
window.SEED = {
  ledgers: [
    { name: "默认账本", icon: "📒", color: "#4C8DFF" }
  ],
  categories: [
    // 支出
    { name: "餐饮", type: "expense", icon: "🍜", color: "#FF6B5E", builtin: true },
    { name: "交通", type: "expense", icon: "🚌", color: "#4C8DFF", builtin: true },
    { name: "购物", type: "expense", icon: "🛍️", color: "#FF8A5B", builtin: true },
    { name: "居家", type: "expense", icon: "🏠", color: "#9B6BFF", builtin: true },
    { name: "娱乐", type: "expense", icon: "🎮", color: "#36C5C5", builtin: true },
    { name: "医疗", type: "expense", icon: "💊", color: "#FF5E9A", builtin: true },
    { name: "教育", type: "expense", icon: "📚", color: "#5B8DEF", builtin: true },
    { name: "通讯", type: "expense", icon: "📱", color: "#7C6BFF", builtin: true },
    { name: "人情", type: "expense", icon: "🎁", color: "#FF9F43", builtin: true },
    { name: "旅行", type: "expense", icon: "✈️", color: "#26C6DA", builtin: true },
    { name: "其他", type: "expense", icon: "📦", color: "#9AA0B5", builtin: true },
    // 收入
    { name: "工资", type: "income", icon: "💰", color: "#2BBF7A", builtin: true },
    { name: "奖金", type: "income", icon: "🏆", color: "#36C5C5", builtin: true },
    { name: "理财", type: "income", icon: "📈", color: "#4C8DFF", builtin: true },
    { name: "兼职", type: "income", icon: "💼", color: "#9B6BFF", builtin: true },
    { name: "红包", type: "income", icon: "🧧", color: "#FF5E9A", builtin: true },
    { name: "其他", type: "income", icon: "💵", color: "#9AA0B5", builtin: true }
  ],
  assets: [
    { akey: "bank",   name: "银行存款", icon: "🏦", color: "#4C8DFF", balance: 0 },
    { akey: "cash",   name: "现金",     icon: "💵", color: "#2BBF7A", balance: 0 },
    { akey: "alipay", name: "支付宝",   icon: "🔰", color: "#1677FF", balance: 0 },
    { akey: "wechat", name: "微信",     icon: "💬", color: "#07C160", balance: 0 }
  ]
};
