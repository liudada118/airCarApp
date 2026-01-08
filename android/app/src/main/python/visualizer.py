"""
座椅压力传感器数据可视化工具（集成模式）

功能：
1. 从串口读取压力传感器数据
2. 实时显示靠背和坐垫的热力图
3. 显示集成系统状态（座椅状态、自适应锁）
4. 显示24个气囊的实时状态
5. 独立配置窗口
"""

import tkinter as tk
from tkinter import ttk, messagebox, Toplevel
import serial
import serial.tools.list_ports
import numpy as np
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure
import matplotlib.gridspec as gridspec
import threading
import time
import queue
from collections import deque
from integrated_system import IntegratedSeatSystem


class ConfigWindow:
    """集成系统配置窗口（动态表格版本）"""

    def __init__(self, parent, integrated_system):
        self.parent = parent
        self.integrated_system = integrated_system
        self.window = None
        self.tree = None
        self.search_var = None

        # 不可编辑的参数（协议相关、矩阵布局相关）
        self.readonly_modules = {'protocol', 'matrix', 'airbag_mapping'}

        # 修改缓存：key_path -> new_value
        self.pending_changes = {}

    def show(self):
        """显示配置窗口"""
        if self.window is not None and self.window.winfo_exists():
            self.window.lift()
            return

        self.window = Toplevel(self.parent)
        self.window.title("系统配置")
        self.window.geometry("1400x800")

        # 顶部工具栏
        toolbar = ttk.Frame(self.window, padding="5")
        toolbar.pack(side=tk.TOP, fill=tk.X)

        # 搜索框
        ttk.Label(toolbar, text="搜索:").pack(side=tk.LEFT, padx=5)
        self.search_var = tk.StringVar()
        self.search_var.trace('w', lambda *args: self._filter_tree())
        search_entry = ttk.Entry(toolbar, textvariable=self.search_var, width=30)
        search_entry.pack(side=tk.LEFT, padx=5)

        # 按钮
        ttk.Button(toolbar, text="编辑选中", command=self._edit_selected).pack(side=tk.LEFT, padx=5)
        ttk.Button(toolbar, text="应用所有修改", command=self._apply_all).pack(side=tk.LEFT, padx=5)
        ttk.Button(toolbar, text="放弃修改", command=self._discard_changes).pack(side=tk.LEFT, padx=5)
        ttk.Button(toolbar, text="刷新", command=self._reload_config).pack(side=tk.LEFT, padx=5)

        # 待修改计数标签
        self.pending_label = ttk.Label(toolbar, text="待修改: 0", foreground="blue")
        self.pending_label.pack(side=tk.LEFT, padx=20)

        # 创建表格容器
        tree_frame = ttk.Frame(self.window)
        tree_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True, padx=5, pady=5)

        # 创建Treeview表格
        columns = ("key_path", "value", "comment", "status")
        self.tree = ttk.Treeview(tree_frame, columns=columns, show='tree headings', height=25)

        # 设置列
        self.tree.column("#0", width=180, minwidth=150)  # 模块/参数名
        self.tree.column("key_path", width=300, minwidth=200)
        self.tree.column("value", width=120, minwidth=80)
        self.tree.column("comment", width=600, minwidth=300)
        self.tree.column("status", width=80, minwidth=60)

        # 设置表头
        self.tree.heading("#0", text="模块/参数")
        self.tree.heading("key_path", text="完整路径")
        self.tree.heading("value", text="当前值")
        self.tree.heading("comment", text="说明")
        self.tree.heading("status", text="状态")

        # 添加滚动条
        v_scrollbar = ttk.Scrollbar(tree_frame, orient="vertical", command=self.tree.yview)
        h_scrollbar = ttk.Scrollbar(tree_frame, orient="horizontal", command=self.tree.xview)
        self.tree.configure(yscrollcommand=v_scrollbar.set, xscrollcommand=h_scrollbar.set)

        # 布局
        self.tree.grid(row=0, column=0, sticky='nsew')
        v_scrollbar.grid(row=0, column=1, sticky='ns')
        h_scrollbar.grid(row=1, column=0, sticky='ew')

        tree_frame.grid_rowconfigure(0, weight=1)
        tree_frame.grid_columnconfigure(0, weight=1)

        # 双击编辑
        self.tree.bind('<Double-1>', lambda e: self._edit_selected())

        # 底部状态栏
        status_frame = ttk.Frame(self.window, padding="5")
        status_frame.pack(side=tk.BOTTOM, fill=tk.X)

        self.status_label = ttk.Label(status_frame, text="就绪", foreground="green")
        self.status_label.pack(side=tk.LEFT)

        ttk.Button(status_frame, text="关闭", command=self.window.destroy).pack(side=tk.RIGHT, padx=5)

        # 加载配置数据
        self._load_config_data()

    def _load_config_data(self):
        """加载配置数据到表格"""
        if not self.integrated_system:
            self.status_label.config(text="错误: 集成系统未初始化", foreground="red")
            return

        # 清空表格
        for item in self.tree.get_children():
            self.tree.delete(item)

        # 获取所有配置及注释
        try:
            all_config = self.integrated_system.config.get_all_with_comments()
        except Exception as e:
            self.status_label.config(text=f"错误: {e}", foreground="red")
            return

        # 按模块分组
        modules = {}
        for key_path, data in all_config.items():
            module_name = key_path.split('.')[0]
            if module_name not in modules:
                modules[module_name] = []
            modules[module_name].append((key_path, data))

        # 插入树形结构
        for module_name in sorted(modules.keys()):
            # 判断是否只读
            is_readonly = module_name in self.readonly_modules
            readonly_tag = " [只读]" if is_readonly else ""

            # 创建模块节点
            module_node = self.tree.insert('', 'end', text=f"{module_name}{readonly_tag}",
                                          values=("", "", "", ""), tags=(module_name,))

            # 添加参数
            for key_path, data in sorted(modules[module_name], key=lambda x: x[0]):
                param_name = key_path.split('.')[-1]
                value = data['value']
                comment = data['comment'] if data['comment'] else ""

                # 检查是否废弃
                is_deprecated = comment and '[已废弃]' in comment
                status = "[已废弃]" if is_deprecated else ("[只读]" if is_readonly else "")

                # 显示值（列表简化显示）
                if isinstance(value, list):
                    display_value = f"[{len(value)}项]"
                else:
                    display_value = str(value)

                # 配置标签
                tags = [module_name]
                if is_deprecated:
                    tags.append('deprecated')
                if is_readonly:
                    tags.append('readonly')

                # 插入参数行
                self.tree.insert(module_node, 'end', text=f"  {param_name}",
                               values=(key_path, display_value, comment, status),
                               tags=tuple(tags))

        # 配置标签样式
        self.tree.tag_configure('deprecated', foreground='gray')
        self.tree.tag_configure('readonly', foreground='blue')

        # 展开所有模块
        for item in self.tree.get_children():
            self.tree.item(item, open=True)

        self.status_label.config(text=f"已加载 {len(all_config)} 个配置参数", foreground="green")

    def _filter_tree(self):
        """根据搜索框过滤表格"""
        search_text = self.search_var.get().lower()

        if not search_text:
            # 显示所有
            for item in self.tree.get_children():
                self._show_item_recursive(item)
            return

        # 隐藏不匹配的
        for module_item in self.tree.get_children():
            module_has_match = False
            for param_item in self.tree.get_children(module_item):
                values = self.tree.item(param_item)['values']
                text = self.tree.item(param_item)['text']

                # 搜索：参数名、完整路径、值、注释
                if (search_text in text.lower() or
                    search_text in str(values[0]).lower() or
                    search_text in str(values[1]).lower() or
                    search_text in str(values[2]).lower()):
                    self.tree.item(param_item, tags=self.tree.item(param_item)['tags'])  # 显示
                    module_has_match = True
                else:
                    # 隐藏（通过移除tags不会真正隐藏，改用detach）
                    self.tree.detach(param_item)

            # 模块是否显示取决于是否有匹配的参数
            if module_has_match:
                self.tree.item(module_item, open=True)
            else:
                self.tree.detach(module_item)

    def _show_item_recursive(self, item):
        """递归显示项目"""
        self.tree.reattach(item, '', 'end')
        for child in self.tree.get_children(item):
            self._show_item_recursive(child)

    def _edit_selected(self):
        """编辑选中的参数"""
        selection = self.tree.selection()
        if not selection:
            messagebox.showinfo("提示", "请先选择一个参数")
            return

        item = selection[0]
        values = self.tree.item(item)['values']

        # 检查是否是参数行（不是模块行）
        if not values[0]:  # key_path为空说明是模块行
            messagebox.showinfo("提示", "请选择具体的参数，而非模块")
            return

        key_path = values[0]
        current_value = values[1]
        comment = values[2]
        status = values[3]

        # 检查是否只读或废弃
        if "[只读]" in status:
            messagebox.showwarning("警告", f"参数 {key_path} 为只读，不可修改")
            return

        if "[已废弃]" in status:
            result = messagebox.askyesno("警告", f"参数 {key_path} 已废弃\n确定要修改吗？")
            if not result:
                return

        # 弹出编辑对话框
        edit_dialog = Toplevel(self.window)
        edit_dialog.title(f"编辑参数")
        edit_dialog.geometry("600x300")

        # 参数信息
        info_frame = ttk.Frame(edit_dialog, padding="10")
        info_frame.pack(side=tk.TOP, fill=tk.X)

        ttk.Label(info_frame, text="参数路径:", font=("Arial", 9, "bold")).grid(row=0, column=0, sticky=tk.W, pady=2)
        ttk.Label(info_frame, text=key_path, foreground="blue").grid(row=0, column=1, sticky=tk.W, pady=2)

        ttk.Label(info_frame, text="说明:", font=("Arial", 9, "bold")).grid(row=1, column=0, sticky=tk.W, pady=2)
        comment_label = ttk.Label(info_frame, text=comment if comment else "(无说明)", wraplength=500)
        comment_label.grid(row=1, column=1, sticky=tk.W, pady=2)

        ttk.Label(info_frame, text="当前值:", font=("Arial", 9, "bold")).grid(row=2, column=0, sticky=tk.W, pady=2)
        ttk.Label(info_frame, text=current_value, foreground="green").grid(row=2, column=1, sticky=tk.W, pady=2)

        # 新值输入
        input_frame = ttk.Frame(edit_dialog, padding="10")
        input_frame.pack(side=tk.TOP, fill=tk.X)

        ttk.Label(input_frame, text="新值:", font=("Arial", 10, "bold")).pack(side=tk.LEFT, padx=5)
        new_value_var = tk.StringVar(value=current_value)
        new_value_entry = ttk.Entry(input_frame, textvariable=new_value_var, width=40)
        new_value_entry.pack(side=tk.LEFT, padx=5)
        new_value_entry.focus()

        # 按钮
        button_frame = ttk.Frame(edit_dialog, padding="10")
        button_frame.pack(side=tk.BOTTOM, fill=tk.X)

        def confirm_edit():
            new_value_str = new_value_var.get()
            try:
                # 推断类型并转换
                original_value = self.integrated_system.config.get(key_path)
                if isinstance(original_value, bool):
                    new_value = new_value_str.lower() in ('true', '1', 'yes')
                elif isinstance(original_value, (int, float)):
                    # 智能数值转换：支持所有数值输入小数
                    # 如果输入包含小数点或科学计数法，使用float
                    if '.' in new_value_str or 'e' in new_value_str.lower():
                        new_value = float(new_value_str)
                    else:
                        # 输入不含小数点，尝试保留原类型
                        if isinstance(original_value, int):
                            new_value = int(new_value_str)
                        else:
                            new_value = float(new_value_str)
                else:
                    new_value = new_value_str

                # 缓存修改
                self.pending_changes[key_path] = new_value

                # 更新表格显示
                self.tree.set(item, 'value', str(new_value))
                self.tree.set(item, 'status', "[待应用]")

                # 更新计数
                self.pending_label.config(text=f"待修改: {len(self.pending_changes)}")

                edit_dialog.destroy()
                self.status_label.config(text=f"已暂存修改: {key_path}", foreground="blue")

            except ValueError as e:
                messagebox.showerror("错误", f"值格式错误: {e}")

        ttk.Button(button_frame, text="确认", command=confirm_edit).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="取消", command=edit_dialog.destroy).pack(side=tk.LEFT, padx=5)

    def _apply_all(self):
        """应用所有待修改的配置"""
        if not self.pending_changes:
            messagebox.showinfo("提示", "没有待应用的修改")
            return

        if not self.integrated_system:
            messagebox.showerror("错误", "集成系统未初始化")
            return

        # 确认
        result = messagebox.askyesno("确认", f"确定要应用 {len(self.pending_changes)} 项修改吗？")
        if not result:
            return

        try:
            print("\n[配置] 批量应用修改...")
            count = len(self.pending_changes)

            # 批量应用（最后一个才保存）
            items = list(self.pending_changes.items())
            for i, (key_path, value) in enumerate(items):
                is_last = (i == count - 1)
                self.integrated_system.set_param(key_path, value, auto_save=is_last)
                print(f"  [{i+1}/{count}] {key_path} = {value}")

            print(f"[配置] 应用完成，共 {count} 项")

            # 清空缓存
            self.pending_changes.clear()
            self.pending_label.config(text="待修改: 0")

            # 刷新表格
            self._reload_config()

            messagebox.showinfo("成功", f"已应用 {count} 项配置并保存到文件")
            self.status_label.config(text="配置已成功应用", foreground="green")

        except Exception as e:
            messagebox.showerror("错误", f"应用失败: {e}")
            import traceback
            traceback.print_exc()

    def _discard_changes(self):
        """放弃所有待修改的配置"""
        if not self.pending_changes:
            messagebox.showinfo("提示", "没有待放弃的修改")
            return

        result = messagebox.askyesno("确认", f"确定要放弃 {len(self.pending_changes)} 项修改吗？")
        if result:
            self.pending_changes.clear()
            self.pending_label.config(text="待修改: 0")
            self._reload_config()
            self.status_label.config(text="已放弃所有修改", foreground="orange")

    def _reload_config(self):
        """重新加载配置"""
        if self.integrated_system:
            self.integrated_system.config.reload()
        self._load_config_data()


class HeatmapWindow:
    """热力图显示窗口"""

    def __init__(self, parent, vmin, vmax, heatmap_queues):
        self.parent = parent
        self.window = None
        self.vmin = vmin
        self.vmax = vmax

        # 热力图数据队列（从主窗口传递）
        self.heatmap_queue_backrest_left = heatmap_queues['backrest_left']
        self.heatmap_queue_backrest_center = heatmap_queues['backrest_center']
        self.heatmap_queue_backrest_right = heatmap_queues['backrest_right']
        self.heatmap_queue_cushion_left = heatmap_queues['cushion_left']
        self.heatmap_queue_cushion_center = heatmap_queues['cushion_center']
        self.heatmap_queue_cushion_right = heatmap_queues['cushion_right']

        # 文本标注字典
        self.text_annotations = {}

        # 更新标志
        self.is_updating = False

    def show(self):
        """显示热力图窗口"""
        if self.window is not None and self.window.winfo_exists():
            self.window.lift()
            return

        self.window = Toplevel(self.parent)
        self.window.title("压力传感器热力图")
        self.window.geometry("1600x900")

        # 创建matplotlib figure
        self.fig = Figure(figsize=(16, 8), dpi=100)
        self.fig.suptitle('座椅压力传感器实时数据', fontsize=14, fontproperties='SimHei')

        # 使用GridSpec创建自定义布局
        gs = self.fig.add_gridspec(2, 17, hspace=0.3, wspace=0.5)

        # 第1行：靠背区域
        self.ax_backrest_left = self.fig.add_subplot(gs[0, 0:2])
        self.ax_backrest_center = self.fig.add_subplot(gs[0, 3:14])
        self.ax_backrest_right = self.fig.add_subplot(gs[0, 15:17])

        # 第2行：坐垫区域
        self.ax_cushion_left = self.fig.add_subplot(gs[1, 0:2])
        self.ax_cushion_center = self.fig.add_subplot(gs[1, 3:14])
        self.ax_cushion_right = self.fig.add_subplot(gs[1, 15:17])

        # 设置标题
        self.ax_backrest_left.set_title('靠背左(3×2)', fontproperties='SimHei', fontsize=9)
        self.ax_backrest_center.set_title('靠背中(10×6)', fontproperties='SimHei', fontsize=10, fontweight='bold')
        self.ax_backrest_right.set_title('靠背右(3×2)', fontproperties='SimHei', fontsize=9)
        self.ax_cushion_left.set_title('坐垫左(3×2)', fontproperties='SimHei', fontsize=9)
        self.ax_cushion_center.set_title('坐垫中(10×6)', fontproperties='SimHei', fontsize=10, fontweight='bold')
        self.ax_cushion_right.set_title('坐垫右(3×2)', fontproperties='SimHei', fontsize=9)

        # 初始化热力图
        self.im_backrest_left = self.ax_backrest_left.imshow(
            np.zeros((3, 2)), cmap='viridis', vmin=self.vmin, vmax=self.vmax, aspect='auto', interpolation='nearest')
        self.im_backrest_center = self.ax_backrest_center.imshow(
            np.zeros((10, 6)), cmap='viridis', vmin=self.vmin, vmax=self.vmax, aspect='auto', interpolation='nearest')
        self.im_backrest_right = self.ax_backrest_right.imshow(
            np.zeros((3, 2)), cmap='viridis', vmin=self.vmin, vmax=self.vmax, aspect='auto', interpolation='nearest')

        self.im_cushion_left = self.ax_cushion_left.imshow(
            np.zeros((3, 2)), cmap='viridis', vmin=self.vmin, vmax=self.vmax, aspect='auto', interpolation='nearest')
        self.im_cushion_center = self.ax_cushion_center.imshow(
            np.zeros((10, 6)), cmap='viridis', vmin=self.vmin, vmax=self.vmax, aspect='auto', interpolation='nearest')
        self.im_cushion_right = self.ax_cushion_right.imshow(
            np.zeros((3, 2)), cmap='viridis', vmin=self.vmin, vmax=self.vmax, aspect='auto', interpolation='nearest')

        # 添加颜色条
        self.fig.colorbar(self.im_backrest_center, ax=self.ax_backrest_center, fraction=0.03, pad=0.04)
        self.fig.colorbar(self.im_cushion_center, ax=self.ax_cushion_center, fraction=0.03, pad=0.04)

        # 配置网格和刻度
        self._setup_grid(self.ax_backrest_left, 3, 2)
        self._setup_grid(self.ax_backrest_center, 10, 6)
        self._setup_grid(self.ax_backrest_right, 3, 2)
        self._setup_grid(self.ax_cushion_left, 3, 2)
        self._setup_grid(self.ax_cushion_center, 10, 6)
        self._setup_grid(self.ax_cushion_right, 3, 2)

        # 初始化文本标注
        self.text_annotations = {
            'backrest_left': {},
            'backrest_center': {},
            'backrest_right': {},
            'cushion_left': {},
            'cushion_center': {},
            'cushion_right': {}
        }

        self._add_text_annotations(self.ax_backrest_left, 3, 2, 'backrest_left')
        self._add_text_annotations(self.ax_backrest_center, 10, 6, 'backrest_center')
        self._add_text_annotations(self.ax_backrest_right, 3, 2, 'backrest_right')
        self._add_text_annotations(self.ax_cushion_left, 3, 2, 'cushion_left')
        self._add_text_annotations(self.ax_cushion_center, 10, 6, 'cushion_center')
        self._add_text_annotations(self.ax_cushion_right, 3, 2, 'cushion_right')

        # 嵌入到tkinter
        self.canvas = FigureCanvasTkAgg(self.fig, master=self.window)
        self.canvas.draw()
        self.canvas.get_tk_widget().pack(side=tk.TOP, fill=tk.BOTH, expand=True)

        # 启动更新循环
        self.is_updating = True
        self.window.protocol("WM_DELETE_WINDOW", self.close)
        self.window.after(60, self.update_heatmaps)

    def _setup_grid(self, ax, rows, cols):
        """配置网格线和刻度"""
        ax.set_xticks(np.arange(-0.5, cols, 1), minor=False)
        ax.set_yticks(np.arange(-0.5, rows, 1), minor=False)
        ax.set_xticklabels([])
        ax.set_yticklabels([])
        ax.grid(which='major', color='white', linestyle='-', linewidth=2)
        ax.tick_params(which='major', size=0)

    def _add_text_annotations(self, ax, rows, cols, key):
        """添加文本标注到热力图"""
        for i in range(rows):
            for j in range(cols):
                text = ax.text(j, i, '0', ha='center', va='center',
                             color='white', fontsize=8, fontweight='bold')
                self.text_annotations[key][(i, j)] = text

    def _update_text_annotations(self, data, key):
        """更新文本标注的值"""
        rows, cols = data.shape
        for i in range(rows):
            for j in range(cols):
                value = int(data[i, j])
                self.text_annotations[key][(i, j)].set_text(str(value))

    def update_heatmaps(self):
        """更新所有热力图"""
        if not self.is_updating or self.window is None or not self.window.winfo_exists():
            return

        try:
            # 更新靠背左
            if not self.heatmap_queue_backrest_left.empty():
                data = self.heatmap_queue_backrest_left.get_nowait()
                self.im_backrest_left.set_data(data)
                self._update_text_annotations(data, 'backrest_left')

            # 更新靠背中
            if not self.heatmap_queue_backrest_center.empty():
                data = self.heatmap_queue_backrest_center.get_nowait()
                self.im_backrest_center.set_data(data)
                self._update_text_annotations(data, 'backrest_center')

            # 更新靠背右
            if not self.heatmap_queue_backrest_right.empty():
                data = self.heatmap_queue_backrest_right.get_nowait()
                self.im_backrest_right.set_data(data)
                self._update_text_annotations(data, 'backrest_right')

            # 更新坐垫左
            if not self.heatmap_queue_cushion_left.empty():
                data = self.heatmap_queue_cushion_left.get_nowait()
                self.im_cushion_left.set_data(data)
                self._update_text_annotations(data, 'cushion_left')

            # 更新坐垫中
            if not self.heatmap_queue_cushion_center.empty():
                data = self.heatmap_queue_cushion_center.get_nowait()
                self.im_cushion_center.set_data(data)
                self._update_text_annotations(data, 'cushion_center')

            # 更新坐垫右
            if not self.heatmap_queue_cushion_right.empty():
                data = self.heatmap_queue_cushion_right.get_nowait()
                self.im_cushion_right.set_data(data)
                self._update_text_annotations(data, 'cushion_right')

            self.canvas.draw()
        except queue.Empty:
            pass
        except Exception as e:
            print(f"热力图更新错误: {e}")

        self.window.after(60, self.update_heatmaps)

    def update_range(self, vmin, vmax):
        """更新热力图范围"""
        self.vmin = vmin
        self.vmax = vmax
        if self.window is not None and self.window.winfo_exists():
            self.im_backrest_left.set_clim(vmin, vmax)
            self.im_backrest_center.set_clim(vmin, vmax)
            self.im_backrest_right.set_clim(vmin, vmax)
            self.im_cushion_left.set_clim(vmin, vmax)
            self.im_cushion_center.set_clim(vmin, vmax)
            self.im_cushion_right.set_clim(vmin, vmax)
            self.canvas.draw()

    def close(self):
        """关闭窗口"""
        self.is_updating = False
        if self.window is not None:
            self.window.destroy()
            self.window = None


class TapMassageWindow:
    """拍打按摩信号监控窗口"""

    def __init__(self, parent, integrated_system):
        """
        初始化拍打按摩窗口

        Args:
            parent: 父窗口
            integrated_system: IntegratedSeatSystem对象
        """
        self.parent = parent
        self.integrated_system = integrated_system
        self.window = None
        self.is_updating = False

        # matplotlib组件
        self.fig = None
        self.canvas = None
        self.ax_backrest = None
        self.ax_cushion = None
        self.line_backrest = None
        self.line_cushion = None
        self.threshold_line_backrest = None
        self.threshold_line_cushion = None

        # tkinter组件（状态文本）
        self.backrest_status_text = None
        self.cushion_status_text = None

    def show(self):
        """显示拍打按摩窗口"""
        if self.window is not None and self.window.winfo_exists():
            self.window.lift()
            return

        self.window = Toplevel(self.parent)
        self.window.title("拍打按摩信号监控")
        self.window.geometry("1200x800")
        self.window.protocol("WM_DELETE_WINDOW", self.close)

        # 创建主容器
        main_frame = ttk.Frame(self.window, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # 创建matplotlib figure
        from matplotlib.figure import Figure
        from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

        self.fig = Figure(figsize=(12, 8), dpi=100)
        self.fig.suptitle('拍打按摩信号监控', fontsize=14, fontproperties='SimHei')

        # 使用GridSpec创建布局（3行2列）
        import matplotlib.gridspec as gridspec
        gs = self.fig.add_gridspec(3, 2, hspace=0.3, wspace=0.3, height_ratios=[2, 2, 1])

        # 靠背信号曲线（第1行，跨2列）
        self.ax_backrest = self.fig.add_subplot(gs[0, :])
        self.ax_backrest.set_title('靠背右侧拍打信号', fontproperties='SimHei')
        self.ax_backrest.set_xlabel('时间窗口（帧）')
        self.ax_backrest.set_ylabel('帧差均值')
        self.ax_backrest.grid(True, alpha=0.3)
        self.line_backrest, = self.ax_backrest.plot([], [], 'b-', linewidth=2, label='信号')
        self.threshold_line_backrest = self.ax_backrest.axhline(50, color='r',
                                                                  linestyle='--', linewidth=1.5, label='阈值')
        self.ax_backrest.legend(loc='upper right')
        self.ax_backrest.set_ylim(0, 150)

        # 坐垫信号曲线（第2行，跨2列）
        self.ax_cushion = self.fig.add_subplot(gs[1, :])
        self.ax_cushion.set_title('坐垫右侧拍打信号', fontproperties='SimHei')
        self.ax_cushion.set_xlabel('时间窗口（帧）')
        self.ax_cushion.set_ylabel('帧差均值')
        self.ax_cushion.grid(True, alpha=0.3)
        self.line_cushion, = self.ax_cushion.plot([], [], 'b-', linewidth=2, label='信号')
        self.threshold_line_cushion = self.ax_cushion.axhline(50, color='r',
                                                                linestyle='--', linewidth=1.5, label='阈值')
        self.ax_cushion.legend(loc='upper right')
        self.ax_cushion.set_ylim(0, 150)

        # 创建canvas并嵌入tkinter
        self.canvas = FigureCanvasTkAgg(self.fig, master=main_frame)
        self.canvas.get_tk_widget().pack(side=tk.TOP, fill=tk.BOTH, expand=True)

        # 状态信息面板（第3行，使用tkinter Label）
        status_frame = ttk.Frame(main_frame)
        status_frame.pack(side=tk.BOTTOM, fill=tk.X, pady=10)

        # 靠背按摩状态（左侧）
        backrest_frame = ttk.LabelFrame(status_frame, text="靠背按摩状态", padding="10")
        backrest_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=5)

        self.backrest_status_text = tk.Text(backrest_frame, height=4, width=30,
                                             font=("Courier New", 10))
        self.backrest_status_text.pack()
        self.backrest_status_text.config(state=tk.DISABLED)

        # 坐垫按摩状态（右侧）
        cushion_frame = ttk.LabelFrame(status_frame, text="坐垫按摩状态", padding="10")
        cushion_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=5)

        self.cushion_status_text = tk.Text(cushion_frame, height=4, width=30,
                                            font=("Courier New", 10))
        self.cushion_status_text.pack()
        self.cushion_status_text.config(state=tk.DISABLED)

        # 启动更新循环
        self.is_updating = True
        self.update_display()

    def update_display(self):
        """更新显示（每100ms调用一次）"""
        if not self.is_updating or self.window is None or not self.window.winfo_exists():
            return

        try:
            # 从检测器获取数据
            if self.integrated_system and self.integrated_system.tap_massage_detector:
                vis_data = self.integrated_system.tap_massage_detector.get_visualization_data()

                # 更新靠背曲线
                backrest_signal = vis_data['backrest_signal']
                if len(backrest_signal) > 0:
                    x = list(range(len(backrest_signal)))
                    self.line_backrest.set_data(x, backrest_signal)
                    self.ax_backrest.set_xlim(0, max(len(backrest_signal), 10))

                    # 更新阈值线
                    self.threshold_line_backrest.set_ydata([vis_data['threshold']] * 2)

                # 更新坐垫曲线
                cushion_signal = vis_data['cushion_signal']
                if len(cushion_signal) > 0:
                    x = list(range(len(cushion_signal)))
                    self.line_cushion.set_data(x, cushion_signal)
                    self.ax_cushion.set_xlim(0, max(len(cushion_signal), 10))

                    # 更新阈值线
                    self.threshold_line_cushion.set_ydata([vis_data['threshold']] * 2)

                # 重绘曲线
                self.canvas.draw()

                # 更新状态文本
                self._update_status_text(vis_data)

        except Exception as e:
            print(f"[拍打按摩窗口] 更新错误: {e}")

        # 每100ms更新一次
        if self.window and self.window.winfo_exists():
            self.window.after(100, self.update_display)

    def _update_status_text(self, vis_data):
        """更新状态文本"""
        # 靠背状态
        backrest_status = "开启" if vis_data['backrest_massage_active'] else "关闭"
        backrest_tap_count = vis_data['backrest_tap_count']
        backrest_events = vis_data['backrest_tap_events']
        last_event_frame = backrest_events[-1][0] if len(backrest_events) > 0 else "无"

        backrest_text = f"状态: {backrest_status}\n"
        backrest_text += f"窗口内拍打: {backrest_tap_count}次\n"
        backrest_text += f"最近触发帧: {last_event_frame}\n"
        backrest_text += f"历史触发: {len(backrest_events)}次"

        self.backrest_status_text.config(state=tk.NORMAL)
        self.backrest_status_text.delete(1.0, tk.END)
        self.backrest_status_text.insert(1.0, backrest_text)
        self.backrest_status_text.config(state=tk.DISABLED)

        # 坐垫状态
        cushion_status = "开启" if vis_data['cushion_massage_active'] else "关闭"
        cushion_tap_count = vis_data['cushion_tap_count']
        cushion_events = vis_data['cushion_tap_events']
        last_event_frame = cushion_events[-1][0] if len(cushion_events) > 0 else "无"

        cushion_text = f"状态: {cushion_status}\n"
        cushion_text += f"窗口内拍打: {cushion_tap_count}次\n"
        cushion_text += f"最近触发帧: {last_event_frame}\n"
        cushion_text += f"历史触发: {len(cushion_events)}次"

        self.cushion_status_text.config(state=tk.NORMAL)
        self.cushion_status_text.delete(1.0, tk.END)
        self.cushion_status_text.insert(1.0, cushion_text)
        self.cushion_status_text.config(state=tk.DISABLED)

    def close(self):
        """关闭窗口"""
        self.is_updating = False
        if self.window is not None:
            self.window.destroy()
            self.window = None


class SensorVisualizer:
    """压力传感器可视化工具"""

    def __init__(self, root):
        """初始化GUI"""
        self.root = root
        self.root.title("座椅压力传感器可视化工具 - 集成模式")
        self.root.geometry("1400x900")

        # 串口相关
        self.serial_port = None
        self.is_connected = False
        self.is_running = False

        # 数据缓冲区
        self.data_buffer = bytearray()
        self.frame_tail = np.array([170, 85, 3, 153])  # 0xAA, 0x55, 0x03, 0x99

        # 帧率统计
        self.frame_count = 0
        self.fps = 0
        self.frame_times = deque(maxlen=30)

        # 热力图范围
        self.vmin = 0
        self.vmax = 255

        # 数据队列（maxsize=1 只保留最新数据）
        self.heatmap_queue_backrest_left = queue.Queue(maxsize=1)
        self.heatmap_queue_backrest_right = queue.Queue(maxsize=1)
        self.heatmap_queue_backrest_center = queue.Queue(maxsize=1)
        self.heatmap_queue_cushion_left = queue.Queue(maxsize=1)
        self.heatmap_queue_cushion_right = queue.Queue(maxsize=1)
        self.heatmap_queue_cushion_center = queue.Queue(maxsize=1)

        # 集成系统
        self.integrated_system = None

        # 配置窗口
        self.config_window = None

        # 热力图窗口
        self.heatmap_window = None

        # 拍打按摩窗口
        self.tap_massage_window = None

        # 气囊名称映射
        self.airbag_names = {
            1: "右侧翼上", 2: "左侧翼上", 3: "右侧翼下", 4: "左侧翼下",
            5: "腰托1", 6: "腰托2", 7: "臀托1", 8: "臀托2",
            9: "右腿托", 10: "左腿托",
            11: "靠背按摩1", 12: "靠背按摩2", 13: "靠背按摩3", 14: "靠背按摩4",
            15: "靠背按摩5", 16: "靠背按摩6", 17: "靠背按摩7", 18: "靠背按摩8",
            19: "坐垫按摩1", 20: "坐垫按摩2", 21: "坐垫按摩3",
            22: "坐垫按摩4", 23: "坐垫按摩5", 24: "坐垫按摩6"
        }

        # 控制指令计数
        self.command_count = 0
        self.last_command_frame = 0

        # 创建UI
        self._create_ui()

        # 启动UI更新定时器
        self.start_ui_timers()

    def _create_ui(self):
        """创建用户界面"""
        # 创建主滚动容器
        main_canvas = tk.Canvas(self.root)
        scrollbar = ttk.Scrollbar(self.root, orient="vertical", command=main_canvas.yview)
        self.scrollable_main_frame = ttk.Frame(main_canvas)

        self.scrollable_main_frame.bind(
            "<Configure>",
            lambda _: main_canvas.configure(scrollregion=main_canvas.bbox("all"))
        )

        main_canvas.create_window((0, 0), window=self.scrollable_main_frame, anchor="nw")
        main_canvas.configure(yscrollcommand=scrollbar.set)

        main_canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # 绑定鼠标滚轮事件
        def _on_mousewheel(event):
            main_canvas.yview_scroll(int(-1*(event.delta/120)), "units")
        main_canvas.bind_all("<MouseWheel>", _on_mousewheel)

        # 顶部控制面板
        control_frame = ttk.Frame(self.scrollable_main_frame, padding="10")
        control_frame.pack(side=tk.TOP, fill=tk.X)

        # 串口选择
        ttk.Label(control_frame, text="串口:").grid(row=0, column=0, padx=5, pady=5, sticky=tk.W)
        self.port_combo = ttk.Combobox(control_frame, width=15, state="readonly")
        self.port_combo.grid(row=0, column=1, padx=5, pady=5)
        self._refresh_ports()

        ttk.Button(control_frame, text="刷新", command=self._refresh_ports).grid(row=0, column=2, padx=5, pady=5)

        # 波特率（固定为1000000）
        ttk.Label(control_frame, text="波特率:").grid(row=0, column=3, padx=5, pady=5, sticky=tk.W)
        self.baudrate_var = tk.StringVar(value="1000000")
        ttk.Entry(control_frame, textvariable=self.baudrate_var, width=10, state="readonly").grid(row=0, column=4, padx=5, pady=5)

        # 连接按钮
        self.connect_btn = ttk.Button(control_frame, text="连接", command=self._toggle_connection)
        self.connect_btn.grid(row=0, column=5, padx=5, pady=5)

        # 配置按钮
        self.config_btn = ttk.Button(control_frame, text="配置", command=self._open_config, state="disabled")
        self.config_btn.grid(row=0, column=6, padx=5, pady=5)

        # 热力图按钮
        self.heatmap_btn = ttk.Button(control_frame, text="热力图", command=self._open_heatmap)
        self.heatmap_btn.grid(row=0, column=7, padx=5, pady=5)

        # 拍打按摩按钮
        self.tap_massage_btn = ttk.Button(control_frame, text="拍打按摩", command=self._open_tap_massage)
        self.tap_massage_btn.grid(row=1, column=0, padx=5, pady=5)

        # 关闭按摩按钮
        self.reset_massage_btn = ttk.Button(control_frame, text="关闭按摩", command=self._reset_massage)
        self.reset_massage_btn.grid(row=1, column=1, padx=5, pady=5)

        # 热力图范围设置
        ttk.Label(control_frame, text="最小值:").grid(row=0, column=8, padx=5, pady=5, sticky=tk.W)
        self.vmin_var = tk.StringVar(value="0")
        ttk.Entry(control_frame, textvariable=self.vmin_var, width=6).grid(row=0, column=9, padx=5, pady=5)

        ttk.Label(control_frame, text="最大值:").grid(row=0, column=10, padx=5, pady=5, sticky=tk.W)
        self.vmax_var = tk.StringVar(value="255")
        ttk.Entry(control_frame, textvariable=self.vmax_var, width=6).grid(row=0, column=11, padx=5, pady=5)

        ttk.Button(control_frame, text="应用", command=self._update_range).grid(row=0, column=12, padx=5, pady=5)

        # 状态栏
        status_frame = ttk.Frame(self.scrollable_main_frame, padding="5")
        status_frame.pack(side=tk.TOP, fill=tk.X)

        self.status_label = ttk.Label(status_frame, text="状态: 未连接", foreground="red")
        self.status_label.pack(side=tk.LEFT, padx=10)

        self.fps_label = ttk.Label(status_frame, text="帧率: 0 FPS", foreground="blue")
        self.fps_label.pack(side=tk.LEFT, padx=10)

        self.frame_count_label = ttk.Label(status_frame, text="总帧数: 0", foreground="green")
        self.frame_count_label.pack(side=tk.LEFT, padx=10)

        # 集成系统状态面板
        self._create_integrated_status_panel()

        # 模块详细输出面板
        self._create_module_output_panel()

        # 控制决策数据面板
        self._create_control_decision_panel()

        # 气囊状态面板
        self._create_airbag_status_panel()

    def _open_heatmap(self):
        """打开热力图窗口"""
        if not self.heatmap_window:
            # 创建热力图数据队列字典
            heatmap_queues = {
                'backrest_left': self.heatmap_queue_backrest_left,
                'backrest_center': self.heatmap_queue_backrest_center,
                'backrest_right': self.heatmap_queue_backrest_right,
                'cushion_left': self.heatmap_queue_cushion_left,
                'cushion_center': self.heatmap_queue_cushion_center,
                'cushion_right': self.heatmap_queue_cushion_right
            }
            self.heatmap_window = HeatmapWindow(self.root, self.vmin, self.vmax, heatmap_queues)

        self.heatmap_window.show()

    def _open_tap_massage(self):
        """打开拍打按摩窗口"""
        if not self.integrated_system:
            messagebox.showwarning("警告", "请先连接串口")
            return

        if not self.integrated_system.tap_massage_detector:
            messagebox.showwarning("警告", "拍打按摩功能未启用")
            return

        if not self.tap_massage_window:
            self.tap_massage_window = TapMassageWindow(self.root, self.integrated_system)

        self.tap_massage_window.show()

    def _reset_massage(self):
        """关闭按摩功能"""
        if not self.integrated_system:
            messagebox.showwarning("警告", "请先连接串口")
            return

        if not self.integrated_system.tap_massage_detector:
            messagebox.showwarning("警告", "拍打按摩功能未启用")
            return

        # 询问是否清空历史
        clear_history = messagebox.askyesno(
            "关闭按摩",
            "是否同时清空拍打检测历史？\n\n"
            "• 是：关闭按摩并清空历史（需重新积累数据才能再次触发）\n"
            "• 否：仅关闭按摩（可立即再次拍打触发）"
        )

        self.integrated_system.reset_massage(clear_history=clear_history)

        if clear_history:
            messagebox.showinfo("提示", "按摩已关闭，检测历史已清空")
        else:
            messagebox.showinfo("提示", "按摩已关闭")

    def _create_integrated_status_panel(self):
        """创建集成系统状态面板"""
        status_frame = ttk.LabelFrame(self.scrollable_main_frame, text="集成系统状态", padding="10")
        status_frame.pack(side=tk.TOP, fill=tk.X, padx=10, pady=5)

        # 第1行：座椅状态和自适应锁
        row1 = ttk.Frame(status_frame)
        row1.pack(fill=tk.X, pady=2)

        ttk.Label(row1, text="座椅状态:", font=("Arial", 10, "bold")).pack(side=tk.LEFT, padx=5)
        self.seat_state_label = ttk.Label(row1, text="OFF_SEAT", font=("Arial", 10, "bold"), foreground="gray")
        self.seat_state_label.pack(side=tk.LEFT, padx=5)

        ttk.Label(row1, text="自适应锁:", font=("Arial", 10, "bold")).pack(side=tk.LEFT, padx=15)
        self.adaptive_lock_label = ttk.Label(row1, text="未锁定", font=("Arial", 10, "bold"), foreground="red")
        self.adaptive_lock_label.pack(side=tk.LEFT, padx=5)

        # 第2行：活体状态和体型
        row2 = ttk.Frame(status_frame)
        row2.pack(fill=tk.X, pady=2)

        ttk.Label(row2, text="活体状态:", font=("Arial", 10)).pack(side=tk.LEFT, padx=5)
        self.living_status_label = ttk.Label(row2, text="离座", font=("Arial", 10), foreground="gray")
        self.living_status_label.pack(side=tk.LEFT, padx=5)

        ttk.Label(row2, text="体型判断:", font=("Arial", 10)).pack(side=tk.LEFT, padx=15)
        self.body_type_label = ttk.Label(row2, text="未判断", font=("Arial", 10), foreground="gray")
        self.body_type_label.pack(side=tk.LEFT, padx=5)

        ttk.Label(row2, text="置信度:", font=("Arial", 10)).pack(side=tk.LEFT, padx=15)
        self.confidence_label = ttk.Label(row2, text="0.000", font=("Arial", 10), foreground="gray")
        self.confidence_label.pack(side=tk.LEFT, padx=5)

        # 第3行：压力值
        row3 = ttk.Frame(status_frame)
        row3.pack(fill=tk.X, pady=2)

        ttk.Label(row3, text="坐垫sum:").pack(side=tk.LEFT, padx=5)
        self.cushion_sum_label = ttk.Label(row3, text="0.0", foreground="blue")
        self.cushion_sum_label.pack(side=tk.LEFT, padx=5)

        ttk.Label(row3, text="靠背sum:").pack(side=tk.LEFT, padx=15)
        self.backrest_sum_label = ttk.Label(row3, text="0.0", foreground="blue")
        self.backrest_sum_label.pack(side=tk.LEFT, padx=5)

        # 第4行：按摩状态
        row4 = ttk.Frame(status_frame)
        row4.pack(fill=tk.X, pady=2)

        ttk.Label(row4, text="靠背按摩:", font=("Arial", 10)).pack(side=tk.LEFT, padx=5)
        self.backrest_massage_label = ttk.Label(row4, text="关闭", font=("Arial", 10), foreground="gray")
        self.backrest_massage_label.pack(side=tk.LEFT, padx=5)

        ttk.Label(row4, text="坐垫按摩:", font=("Arial", 10)).pack(side=tk.LEFT, padx=15)
        self.cushion_massage_label = ttk.Label(row4, text="关闭", font=("Arial", 10), foreground="gray")
        self.cushion_massage_label.pack(side=tk.LEFT, padx=5)

    def _create_module_output_panel(self):
        """创建模块输出面板"""
        module_frame = ttk.LabelFrame(self.scrollable_main_frame, text="模块详细输出", padding="10")
        module_frame.pack(side=tk.TOP, fill=tk.X, padx=10, pady=5)

        # 活体检测输出
        living_frame = ttk.LabelFrame(module_frame, text="活体检测", padding="5")
        living_frame.grid(row=0, column=0, padx=10, pady=5, sticky=tk.W+tk.E)

        living_info_frame = ttk.Frame(living_frame)
        living_info_frame.pack(fill=tk.X)

        ttk.Label(living_info_frame, text="检测计数:").grid(row=0, column=0, padx=5, pady=2, sticky=tk.W)
        self.living_detection_count_label = ttk.Label(living_info_frame, text="0", foreground="blue")
        self.living_detection_count_label.grid(row=0, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(living_info_frame, text="SAD能量:").grid(row=1, column=0, padx=5, pady=2, sticky=tk.W)
        self.living_sad_energy_label = ttk.Label(living_info_frame, text="0.00", foreground="blue")
        self.living_sad_energy_label.grid(row=1, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(living_info_frame, text="SAD分数:").grid(row=2, column=0, padx=5, pady=2, sticky=tk.W)
        self.living_sad_score_label = ttk.Label(living_info_frame, text="0.000", foreground="blue")
        self.living_sad_score_label.grid(row=2, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(living_info_frame, text="阈值:").grid(row=3, column=0, padx=5, pady=2, sticky=tk.W)
        self.living_threshold_label = ttk.Label(living_info_frame, text="0.60", foreground="gray")
        self.living_threshold_label.grid(row=3, column=1, padx=5, pady=2, sticky=tk.W)

        # 体型检测输出
        body_frame = ttk.LabelFrame(module_frame, text="体型检测", padding="5")
        body_frame.grid(row=0, column=1, padx=10, pady=5, sticky=tk.W+tk.E)

        body_info_frame = ttk.Frame(body_frame)
        body_info_frame.pack(fill=tk.X)

        ttk.Label(body_info_frame, text="坐垫原始sum:").grid(row=0, column=0, padx=5, pady=2, sticky=tk.W)
        self.body_cushion_original_sum_label = ttk.Label(body_info_frame, text="0.0", foreground="blue")
        self.body_cushion_original_sum_label.grid(row=0, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(body_info_frame, text="坐垫滤波sum:").grid(row=1, column=0, padx=5, pady=2, sticky=tk.W)
        self.body_cushion_filtered_sum_label = ttk.Label(body_info_frame, text="0.0", foreground="blue")
        self.body_cushion_filtered_sum_label.grid(row=1, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(body_info_frame, text="靠背滤波sum:").grid(row=2, column=0, padx=5, pady=2, sticky=tk.W)
        self.body_backrest_filtered_sum_label = ttk.Label(body_info_frame, text="0.0", foreground="blue")
        self.body_backrest_filtered_sum_label.grid(row=2, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(body_info_frame, text="体型阈值:").grid(row=3, column=0, padx=5, pady=2, sticky=tk.W)
        self.body_thresholds_label = ttk.Label(body_info_frame, text="大人>=3000, 小孩>=1000", foreground="gray", font=("Arial", 8))
        self.body_thresholds_label.grid(row=3, column=1, padx=5, pady=2, sticky=tk.W)

        # 控制指令状态
        control_frame = ttk.LabelFrame(module_frame, text="控制指令", padding="5")
        control_frame.grid(row=0, column=2, padx=10, pady=5, sticky=tk.W+tk.E)

        control_info_frame = ttk.Frame(control_frame)
        control_info_frame.pack(fill=tk.X)

        ttk.Label(control_info_frame, text="指令状态:").grid(row=0, column=0, padx=5, pady=2, sticky=tk.W)
        self.command_status_label = ttk.Label(control_info_frame, text="无指令", foreground="gray")
        self.command_status_label.grid(row=0, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(control_info_frame, text="指令计数:").grid(row=1, column=0, padx=5, pady=2, sticky=tk.W)
        self.command_count_label = ttk.Label(control_info_frame, text="0", foreground="blue")
        self.command_count_label.grid(row=1, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(control_info_frame, text="最后指令:").grid(row=2, column=0, padx=5, pady=2, sticky=tk.W)
        self.last_command_label = ttk.Label(control_info_frame, text="-", foreground="gray", font=("Arial", 8))
        self.last_command_label.grid(row=2, column=1, padx=5, pady=2, sticky=tk.W)

        # 配置网格权重
        module_frame.columnconfigure(0, weight=1)
        module_frame.columnconfigure(1, weight=1)
        module_frame.columnconfigure(2, weight=1)

    def _create_control_decision_panel(self):
        """创建控制决策数据面板"""
        decision_frame = ttk.LabelFrame(self.scrollable_main_frame, text="控制决策数据（用于校验正确性）", padding="10")
        decision_frame.pack(side=tk.TOP, fill=tk.X, padx=10, pady=5)

        # 腰托控制数据
        lumbar_frame = ttk.LabelFrame(decision_frame, text="腰托控制", padding="5")
        lumbar_frame.grid(row=0, column=0, padx=10, pady=5, sticky=tk.W+tk.E)

        lumbar_info_frame = ttk.Frame(lumbar_frame)
        lumbar_info_frame.pack(fill=tk.X)

        ttk.Label(lumbar_info_frame, text="上背压力:").grid(row=0, column=0, padx=5, pady=2, sticky=tk.W)
        self.lumbar_upper_pressure_label = ttk.Label(lumbar_info_frame, text="0.0", foreground="blue")
        self.lumbar_upper_pressure_label.grid(row=0, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(lumbar_info_frame, text="下背压力:").grid(row=1, column=0, padx=5, pady=2, sticky=tk.W)
        self.lumbar_lower_pressure_label = ttk.Label(lumbar_info_frame, text="0.0", foreground="blue")
        self.lumbar_lower_pressure_label.grid(row=1, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(lumbar_info_frame, text="比值:").grid(row=2, column=0, padx=5, pady=2, sticky=tk.W)
        self.lumbar_ratio_label = ttk.Label(lumbar_info_frame, text="0.00", foreground="blue")
        self.lumbar_ratio_label.grid(row=2, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(lumbar_info_frame, text="阈值检查:").grid(row=3, column=0, padx=5, pady=2, sticky=tk.W)
        self.lumbar_threshold_check_label = ttk.Label(lumbar_info_frame, text="未通过", foreground="gray")
        self.lumbar_threshold_check_label.grid(row=3, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(lumbar_info_frame, text="决策:").grid(row=4, column=0, padx=5, pady=2, sticky=tk.W)
        self.lumbar_decision_label = ttk.Label(lumbar_info_frame, text="HOLD", foreground="gray")
        self.lumbar_decision_label.grid(row=4, column=1, padx=5, pady=2, sticky=tk.W)

        # 侧翼控制数据
        wing_frame = ttk.LabelFrame(decision_frame, text="侧翼控制", padding="5")
        wing_frame.grid(row=0, column=1, padx=10, pady=5, sticky=tk.W+tk.E)

        wing_info_frame = ttk.Frame(wing_frame)
        wing_info_frame.pack(fill=tk.X)

        ttk.Label(wing_info_frame, text="左侧压力:").grid(row=0, column=0, padx=5, pady=2, sticky=tk.W)
        self.wing_left_pressure_label = ttk.Label(wing_info_frame, text="0.0", foreground="blue")
        self.wing_left_pressure_label.grid(row=0, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(wing_info_frame, text="右侧压力:").grid(row=1, column=0, padx=5, pady=2, sticky=tk.W)
        self.wing_right_pressure_label = ttk.Label(wing_info_frame, text="0.0", foreground="blue")
        self.wing_right_pressure_label.grid(row=1, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(wing_info_frame, text="比值:").grid(row=2, column=0, padx=5, pady=2, sticky=tk.W)
        self.wing_ratio_label = ttk.Label(wing_info_frame, text="0.00", foreground="blue")
        self.wing_ratio_label.grid(row=2, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(wing_info_frame, text="左翼决策:").grid(row=3, column=0, padx=5, pady=2, sticky=tk.W)
        self.left_wing_decision_label = ttk.Label(wing_info_frame, text="HOLD", foreground="gray")
        self.left_wing_decision_label.grid(row=3, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(wing_info_frame, text="右翼决策:").grid(row=4, column=0, padx=5, pady=2, sticky=tk.W)
        self.right_wing_decision_label = ttk.Label(wing_info_frame, text="HOLD", foreground="gray")
        self.right_wing_decision_label.grid(row=4, column=1, padx=5, pady=2, sticky=tk.W)

        # 腿托控制数据
        leg_frame = ttk.LabelFrame(decision_frame, text="腿托控制", padding="5")
        leg_frame.grid(row=0, column=2, padx=10, pady=5, sticky=tk.W+tk.E)

        leg_info_frame = ttk.Frame(leg_frame)
        leg_info_frame.pack(fill=tk.X)

        # 左腿托数据
        ttk.Label(leg_info_frame, text="左腿托:", font=("Arial", 9, "bold")).grid(row=0, column=0, columnspan=2, padx=5, pady=2, sticky=tk.W)

        ttk.Label(leg_info_frame, text="  腿部压力:").grid(row=1, column=0, padx=5, pady=2, sticky=tk.W)
        self.left_leg_pressure_label = ttk.Label(leg_info_frame, text="0.0", foreground="blue")
        self.left_leg_pressure_label.grid(row=1, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(leg_info_frame, text="  臀部压力:").grid(row=2, column=0, padx=5, pady=2, sticky=tk.W)
        self.left_butt_pressure_label = ttk.Label(leg_info_frame, text="0.0", foreground="blue")
        self.left_butt_pressure_label.grid(row=2, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(leg_info_frame, text="  比值:").grid(row=3, column=0, padx=5, pady=2, sticky=tk.W)
        self.left_leg_ratio_label = ttk.Label(leg_info_frame, text="0.00", foreground="blue")
        self.left_leg_ratio_label.grid(row=3, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(leg_info_frame, text="  决策:").grid(row=4, column=0, padx=5, pady=2, sticky=tk.W)
        self.left_leg_decision_label = ttk.Label(leg_info_frame, text="HOLD", foreground="gray")
        self.left_leg_decision_label.grid(row=4, column=1, padx=5, pady=2, sticky=tk.W)

        # 右腿托数据
        ttk.Label(leg_info_frame, text="右腿托:", font=("Arial", 9, "bold")).grid(row=5, column=0, columnspan=2, padx=5, pady=(10,2), sticky=tk.W)

        ttk.Label(leg_info_frame, text="  腿部压力:").grid(row=6, column=0, padx=5, pady=2, sticky=tk.W)
        self.right_leg_pressure_label = ttk.Label(leg_info_frame, text="0.0", foreground="blue")
        self.right_leg_pressure_label.grid(row=6, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(leg_info_frame, text="  臀部压力:").grid(row=7, column=0, padx=5, pady=2, sticky=tk.W)
        self.right_butt_pressure_label = ttk.Label(leg_info_frame, text="0.0", foreground="blue")
        self.right_butt_pressure_label.grid(row=7, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(leg_info_frame, text="  比值:").grid(row=8, column=0, padx=5, pady=2, sticky=tk.W)
        self.right_leg_ratio_label = ttk.Label(leg_info_frame, text="0.00", foreground="blue")
        self.right_leg_ratio_label.grid(row=8, column=1, padx=5, pady=2, sticky=tk.W)

        ttk.Label(leg_info_frame, text="  决策:").grid(row=9, column=0, padx=5, pady=2, sticky=tk.W)
        self.right_leg_decision_label = ttk.Label(leg_info_frame, text="HOLD", foreground="gray")
        self.right_leg_decision_label.grid(row=9, column=1, padx=5, pady=2, sticky=tk.W)

        # 配置网格权重
        decision_frame.columnconfigure(0, weight=1)
        decision_frame.columnconfigure(1, weight=1)
        decision_frame.columnconfigure(2, weight=1)

    def _create_airbag_status_panel(self):
        """创建气囊状态面板"""
        airbag_frame = ttk.LabelFrame(self.scrollable_main_frame, text="气囊状态（仅自适应锁开启时显示）", padding="10")
        airbag_frame.pack(side=tk.TOP, fill=tk.X, padx=10, pady=5)

        # 创建一个网格来显示气囊状态
        self.airbag_labels = {}

        # 左侧翼气囊 (2, 4)
        left_wing_frame = ttk.LabelFrame(airbag_frame, text="左侧翼", padding="5")
        left_wing_frame.grid(row=0, column=0, padx=10, pady=5, sticky=tk.W)

        for airbag_id in [2, 4]:
            label = ttk.Label(left_wing_frame, text=f"{airbag_id}:{self.airbag_names[airbag_id]} [保持]",
                            font=("Arial", 9), foreground="gray")
            label.pack(pady=2)
            self.airbag_labels[airbag_id] = label

        # 右侧翼气囊 (1, 3)
        right_wing_frame = ttk.LabelFrame(airbag_frame, text="右侧翼", padding="5")
        right_wing_frame.grid(row=0, column=1, padx=10, pady=5, sticky=tk.W)

        for airbag_id in [1, 3]:
            label = ttk.Label(right_wing_frame, text=f"{airbag_id}:{self.airbag_names[airbag_id]} [保持]",
                            font=("Arial", 9), foreground="gray")
            label.pack(pady=2)
            self.airbag_labels[airbag_id] = label

        # 腰托气囊 (5, 6)
        lumbar_frame = ttk.LabelFrame(airbag_frame, text="腰托", padding="5")
        lumbar_frame.grid(row=0, column=2, padx=10, pady=5, sticky=tk.W)

        for airbag_id in [5, 6]:
            label = ttk.Label(lumbar_frame, text=f"{airbag_id}:{self.airbag_names[airbag_id]} [保持]",
                            font=("Arial", 9), foreground="gray")
            label.pack(pady=2)
            self.airbag_labels[airbag_id] = label

        # 臀托气囊 (7, 8)
        butt_frame = ttk.LabelFrame(airbag_frame, text="臀托", padding="5")
        butt_frame.grid(row=0, column=3, padx=10, pady=5, sticky=tk.W)

        for airbag_id in [7, 8]:
            label = ttk.Label(butt_frame, text=f"{airbag_id}:{self.airbag_names[airbag_id]} [保持]",
                            font=("Arial", 9), foreground="gray")
            label.pack(pady=2)
            self.airbag_labels[airbag_id] = label

        # 腿托气囊 (9, 10)
        leg_frame = ttk.LabelFrame(airbag_frame, text="腿托", padding="5")
        leg_frame.grid(row=0, column=4, padx=10, pady=5, sticky=tk.W)

        for airbag_id in [9, 10]:
            label = ttk.Label(leg_frame, text=f"{airbag_id}:{self.airbag_names[airbag_id]} [保持]",
                            font=("Arial", 9), foreground="gray")
            label.pack(pady=2)
            self.airbag_labels[airbag_id] = label

        # === 按摩气囊（第二行）===
        # 靠背按摩气囊 (11-18)
        backrest_massage_frame = ttk.LabelFrame(airbag_frame, text="靠背按摩 (11-18)", padding="5")
        backrest_massage_frame.grid(row=1, column=0, columnspan=3, padx=10, pady=5, sticky=tk.W+tk.E)

        # 分两列显示靠背按摩气囊
        for i, airbag_id in enumerate([11, 12, 13, 14, 15, 16, 17, 18]):
            col = i % 4
            label = ttk.Label(backrest_massage_frame, text=f"{airbag_id}:{self.airbag_names[airbag_id]} [保持]",
                            font=("Arial", 9), foreground="gray")
            label.grid(row=i // 4, column=col, padx=5, pady=2, sticky=tk.W)
            self.airbag_labels[airbag_id] = label

        # 坐垫按摩气囊 (19-24)
        cushion_massage_frame = ttk.LabelFrame(airbag_frame, text="坐垫按摩 (19-24)", padding="5")
        cushion_massage_frame.grid(row=1, column=3, columnspan=2, padx=10, pady=5, sticky=tk.W+tk.E)

        # 分两列显示坐垫按摩气囊
        for i, airbag_id in enumerate([19, 20, 21, 22, 23, 24]):
            col = i % 3
            label = ttk.Label(cushion_massage_frame, text=f"{airbag_id}:{self.airbag_names[airbag_id]} [保持]",
                            font=("Arial", 9), foreground="gray")
            label.grid(row=i // 3, column=col, padx=5, pady=2, sticky=tk.W)
            self.airbag_labels[airbag_id] = label

    def _create_heatmap_area(self):
        """创建热力图显示区域"""
        # 创建matplotlib figure
        self.fig = Figure(figsize=(16, 8), dpi=100)
        self.fig.suptitle('座椅压力传感器实时数据', fontsize=14, fontproperties='SimHei')

        # 使用GridSpec创建自定义布局
        gs = self.fig.add_gridspec(2, 17, hspace=0.3, wspace=0.5)

        # 第1行：靠背区域
        self.ax_backrest_left = self.fig.add_subplot(gs[0, 0:2])
        self.ax_backrest_center = self.fig.add_subplot(gs[0, 3:14])
        self.ax_backrest_right = self.fig.add_subplot(gs[0, 15:17])

        # 第2行：坐垫区域
        self.ax_cushion_left = self.fig.add_subplot(gs[1, 0:2])
        self.ax_cushion_center = self.fig.add_subplot(gs[1, 3:14])
        self.ax_cushion_right = self.fig.add_subplot(gs[1, 15:17])

        # 设置标题
        self.ax_backrest_left.set_title('靠背左(3×2)', fontproperties='SimHei', fontsize=9)
        self.ax_backrest_center.set_title('靠背中(10×6)', fontproperties='SimHei', fontsize=10, fontweight='bold')
        self.ax_backrest_right.set_title('靠背右(3×2)', fontproperties='SimHei', fontsize=9)
        self.ax_cushion_left.set_title('坐垫左(3×2)', fontproperties='SimHei', fontsize=9)
        self.ax_cushion_center.set_title('坐垫中(10×6)', fontproperties='SimHei', fontsize=10, fontweight='bold')
        self.ax_cushion_right.set_title('坐垫右(3×2)', fontproperties='SimHei', fontsize=9)

        # 初始化热力图
        self.im_backrest_left = self.ax_backrest_left.imshow(
            np.zeros((3, 2)), cmap='viridis', vmin=self.vmin, vmax=self.vmax, aspect='auto', interpolation='nearest')
        self.im_backrest_center = self.ax_backrest_center.imshow(
            np.zeros((10, 6)), cmap='viridis', vmin=self.vmin, vmax=self.vmax, aspect='auto', interpolation='nearest')
        self.im_backrest_right = self.ax_backrest_right.imshow(
            np.zeros((3, 2)), cmap='viridis', vmin=self.vmin, vmax=self.vmax, aspect='auto', interpolation='nearest')

        self.im_cushion_left = self.ax_cushion_left.imshow(
            np.zeros((3, 2)), cmap='viridis', vmin=self.vmin, vmax=self.vmax, aspect='auto', interpolation='nearest')
        self.im_cushion_center = self.ax_cushion_center.imshow(
            np.zeros((10, 6)), cmap='viridis', vmin=self.vmin, vmax=self.vmax, aspect='auto', interpolation='nearest')
        self.im_cushion_right = self.ax_cushion_right.imshow(
            np.zeros((3, 2)), cmap='viridis', vmin=self.vmin, vmax=self.vmax, aspect='auto', interpolation='nearest')

        # 添加颜色条
        self.fig.colorbar(self.im_backrest_center, ax=self.ax_backrest_center, fraction=0.03, pad=0.04)
        self.fig.colorbar(self.im_cushion_center, ax=self.ax_cushion_center, fraction=0.03, pad=0.04)

        # 配置网格和刻度
        self._setup_grid(self.ax_backrest_left, 3, 2)
        self._setup_grid(self.ax_backrest_center, 10, 6)
        self._setup_grid(self.ax_backrest_right, 3, 2)
        self._setup_grid(self.ax_cushion_left, 3, 2)
        self._setup_grid(self.ax_cushion_center, 10, 6)
        self._setup_grid(self.ax_cushion_right, 3, 2)

        # 初始化文本标注
        self.text_annotations = {
            'backrest_left': {},
            'backrest_center': {},
            'backrest_right': {},
            'cushion_left': {},
            'cushion_center': {},
            'cushion_right': {}
        }

        self._add_text_annotations(self.ax_backrest_left, 3, 2, 'backrest_left')
        self._add_text_annotations(self.ax_backrest_center, 10, 6, 'backrest_center')
        self._add_text_annotations(self.ax_backrest_right, 3, 2, 'backrest_right')
        self._add_text_annotations(self.ax_cushion_left, 3, 2, 'cushion_left')
        self._add_text_annotations(self.ax_cushion_center, 10, 6, 'cushion_center')
        self._add_text_annotations(self.ax_cushion_right, 3, 2, 'cushion_right')

        # 嵌入到tkinter
        self.canvas = FigureCanvasTkAgg(self.fig, master=self.root)
        self.canvas.draw()
        self.canvas.get_tk_widget().pack(side=tk.TOP, fill=tk.BOTH, expand=True)

    def _setup_grid(self, ax, rows, cols):
        """配置网格线和刻度"""
        ax.set_xticks(np.arange(-0.5, cols, 1), minor=False)
        ax.set_yticks(np.arange(-0.5, rows, 1), minor=False)
        ax.set_xticklabels([])
        ax.set_yticklabels([])
        ax.grid(which='major', color='white', linestyle='-', linewidth=2)
        ax.tick_params(which='major', size=0)

    def _add_text_annotations(self, ax, rows, cols, key):
        """添加文本标注到热力图"""
        for i in range(rows):
            for j in range(cols):
                text = ax.text(j, i, '0', ha='center', va='center',
                             color='white', fontsize=8, fontweight='bold')
                self.text_annotations[key][(i, j)] = text

    def _update_text_annotations(self, data, key):
        """更新文本标注的值"""
        rows, cols = data.shape
        for i in range(rows):
            for j in range(cols):
                value = int(data[i, j])
                self.text_annotations[key][(i, j)].set_text(str(value))

    def _refresh_ports(self):
        """刷新可用串口列表"""
        ports = serial.tools.list_ports.comports()
        port_list = [port.device for port in ports]
        self.port_combo['values'] = port_list
        if port_list:
            self.port_combo.current(0)

    def _toggle_connection(self):
        """切换连接状态"""
        if not self.is_connected:
            self._connect()
        else:
            self._disconnect()

    def _open_config(self):
        """打开配置窗口"""
        if not self.config_window:
            self.config_window = ConfigWindow(self.root, self.integrated_system)
        self.config_window.show()

    def _connect(self):
        """连接串口"""
        port = self.port_combo.get()
        if not port:
            messagebox.showerror("错误", "请选择串口")
            return

        try:
            baudrate = int(self.baudrate_var.get())
            self.serial_port = serial.Serial(port, baudrate, timeout=0.1)
            self.is_connected = True
            self.is_running = True

            # 初始化集成系统
            print("[集成模式] 初始化集成系统...")
            self.integrated_system = IntegratedSeatSystem('sensor_config.yaml')
            print("[集成模式] 集成系统已初始化")

            # 更新UI
            self.connect_btn.config(text="断开")
            self.config_btn.config(state="normal")
            self.status_label.config(text=f"状态: 已连接 ({port})", foreground="green")

            # 启动读取线程
            self.read_thread = threading.Thread(target=self._read_serial_thread, daemon=True)
            self.read_thread.start()

        except Exception as e:
            messagebox.showerror("错误", f"连接失败: {str(e)}")
            self.is_connected = False

    def _disconnect(self):
        """断开串口"""
        self.is_running = False
        if self.serial_port and self.serial_port.is_open:
            self.serial_port.close()
        self.is_connected = False

        # 清理集成系统
        if self.integrated_system:
            self.integrated_system = None
            print("[集成模式] 集成系统已清理")

        self.connect_btn.config(text="连接")
        self.config_btn.config(state="disabled")
        self.status_label.config(text="状态: 未连接", foreground="red")

    def _update_range(self):
        """更新热力图范围"""
        try:
            self.vmin = int(self.vmin_var.get())
            self.vmax = int(self.vmax_var.get())
            # 如果热力图窗口已经打开，更新其范围
            if self.heatmap_window and self.heatmap_window.window and self.heatmap_window.window.winfo_exists():
                self.heatmap_window.update_range(self.vmin, self.vmax)
        except ValueError:
            messagebox.showerror("错误", "请输入有效的数值")

    def _read_serial_thread(self):
        """串口读取线程"""
        while self.is_running:
            try:
                if self.serial_port and self.serial_port.in_waiting > 0:
                    data = self.serial_port.read(self.serial_port.in_waiting)
                    self.data_buffer.extend(data)
                    self._process_buffer()
                else:
                    time.sleep(0.001)
            except Exception as e:
                print(f"读取错误: {e}")
                break

    def _process_buffer(self):
        """处理数据缓冲区"""
        while len(self.data_buffer) >= 148:
            frame_end = self._find_frame_tail()

            if frame_end == -1:
                if len(self.data_buffer) > 1000:
                    self.data_buffer = self.data_buffer[-200:]
                break

            if frame_end >= 144:
                frame_data = np.array(self.data_buffer[frame_end - 144:frame_end], dtype=np.uint8)
                self._parse_frame(frame_data)
                self.data_buffer = self.data_buffer[frame_end + 4:]
            else:
                self.data_buffer = self.data_buffer[frame_end + 4:]

    def _find_frame_tail(self):
        """查找帧尾位置"""
        buffer_array = np.array(self.data_buffer, dtype=np.uint8)
        for i in range(len(buffer_array) - 3):
            if np.array_equal(buffer_array[i:i + 4], self.frame_tail):
                return i
        return -1

    def _parse_frame(self, frame_data):
        """解析一帧数据"""
        backrest_data = frame_data[:72]
        cushion_data = frame_data[72:144]

        # 拆分数据
        back_left, back_right, back_center = self._split_matrix_data(backrest_data)
        cush_left, cush_right, cush_center = self._split_matrix_data(cushion_data)

        # 放入队列
        self._put_queue(self.heatmap_queue_backrest_left, back_left)
        self._put_queue(self.heatmap_queue_backrest_right, back_right)
        self._put_queue(self.heatmap_queue_backrest_center, back_center)
        self._put_queue(self.heatmap_queue_cushion_left, cush_left)
        self._put_queue(self.heatmap_queue_cushion_right, cush_right)
        self._put_queue(self.heatmap_queue_cushion_center, cush_center)

        # 集成系统处理
        if self.integrated_system:
            sensor_data = np.array(frame_data, dtype=np.uint8).reshape(1, 144)
            self.integrated_system.process_frame(sensor_data)

            # 如需自动发送控制指令，可在此处获取结果并发送
            # result = self.integrated_system.get_latest_result()
            # if result and result['control_command']:
            #     # 将list[int]转换为bytes后发送到串口
            #     command_bytes = bytes(result['control_command'])
            #     self.serial_port.write(command_bytes)

        # 更新帧计数和帧率
        self.frame_count += 1
        current_time = time.time()
        self.frame_times.append(current_time)

        if len(self.frame_times) >= 2:
            time_span = self.frame_times[-1] - self.frame_times[0]
            if time_span > 0:
                self.fps = (len(self.frame_times) - 1) / time_span

    def _put_queue(self, q, data):
        """非阻塞放入队列"""
        try:
            q.put_nowait(data.copy())
        except queue.Full:
            pass
        except:
            pass

    def _split_matrix_data(self, data_72):
        """拆分72元素数据为三个部分"""
        left_rect = data_72[0:6].reshape(3, 2)
        right_rect = data_72[6:12].reshape(3, 2)
        center_matrix = data_72[12:72].reshape(10, 6)
        return left_rect, right_rect, center_matrix

    def start_ui_timers(self):
        """启动UI更新定时器"""
        self.root.after(100, self.update_status)
        self.root.after(200, self.update_integrated_display)
        self.root.after(16, self.process_window_events)

    def process_window_events(self):
        """窗口事件处理循环"""
        try:
            self.root.update_idletasks()
        except:
            pass
        self.root.after(16, self.process_window_events)

    def update_status(self):
        """更新状态显示"""
        self.fps_label.config(text=f"帧率: {self.fps:.1f} FPS")
        self.frame_count_label.config(text=f"总帧数: {self.frame_count}")
        self.root.after(100, self.update_status)

    def update_integrated_display(self):
        """更新集成系统显示"""
        if self.integrated_system:
            result = self.integrated_system.get_latest_result()

            if result:
                # 更新座椅状态
                seat_state = result['seat_state']
                self.seat_state_label.config(text=seat_state)

                # 状态颜色
                state_colors = {
                    'OFF_SEAT': 'gray',
                    'CUSHION_ONLY': 'orange',
                    'FULL_SEAT_WAITING': 'blue',
                    'ADAPTIVE_LOCKED': 'green',
                    'RESETTING': 'red'
                }
                self.seat_state_label.config(foreground=state_colors.get(seat_state, 'black'))

                # 自适应锁状态
                if seat_state == 'ADAPTIVE_LOCKED':
                    self.adaptive_lock_label.config(text="已锁定", foreground="green")
                else:
                    self.adaptive_lock_label.config(text="未锁定", foreground="red")

                # 活体状态
                living_status = result['living_status']
                self.living_status_label.config(text=living_status)
                if living_status == "活体":
                    self.living_status_label.config(foreground="green")
                elif living_status == "静物":
                    self.living_status_label.config(foreground="red")
                elif living_status == "检测中":
                    self.living_status_label.config(foreground="blue")
                else:
                    self.living_status_label.config(foreground="gray")

                # 体型判断 - 显示所有可能的体型状态
                body_type = result['body_type']
                self.body_type_label.config(text=body_type)

                # 根据体型设置颜色
                if body_type == "大人":
                    self.body_type_label.config(foreground="blue")
                elif body_type == "小孩":
                    self.body_type_label.config(foreground="orange")
                elif body_type == "静物":
                    self.body_type_label.config(foreground="red")
                else:  # "未判断"
                    self.body_type_label.config(foreground="gray")

                # 置信度
                confidence = result['living_confidence']
                self.confidence_label.config(text=f"{confidence:.3f}")

                # 压力值
                self.cushion_sum_label.config(text=f"{result['cushion_sum']:.1f}")
                self.backrest_sum_label.config(text=f"{result['backrest_sum']:.1f}")

                # 更新按摩状态
                if result.get('tap_massage'):
                    tap_data = result['tap_massage']

                    # 靠背按摩状态
                    if tap_data.get('backrest_massage_active'):
                        self.backrest_massage_label.config(text="开启", foreground="green")
                    else:
                        self.backrest_massage_label.config(text="关闭", foreground="gray")

                    # 坐垫按摩状态
                    if tap_data.get('cushion_massage_active'):
                        self.cushion_massage_label.config(text="开启", foreground="green")
                    else:
                        self.cushion_massage_label.config(text="关闭", foreground="gray")

                # 更新模块详细输出
                self._update_module_output(result)

                # 更新控制决策数据
                self._update_control_decision_data(result)

                # 从队列获取所有待处理的新指令（确保不漏掉）
                pending_commands = self.integrated_system.get_pending_commands()
                if pending_commands:
                    # 有新指令：处理队列中的所有指令
                    for cmd_info in pending_commands:
                        self.command_count += 1
                        self.last_command_frame = cmd_info['frame_count']
                        self._update_command_status(cmd_info['command'], cmd_info)
                    # 只用最后一条指令更新气囊显示
                    last_cmd = pending_commands[-1]
                    self._update_airbag_display_from_command(last_cmd['command'])
                elif result['control_command']:
                    # 无新指令但有缓存指令：显示"延续"状态
                    self.command_status_label.config(text="延续中", foreground="blue")
                    # 气囊状态保持显示当前缓存的指令
                    self._update_airbag_display_from_command(result['control_command'])
                else:
                    # 完全没有指令（系统刚启动或离座）
                    self.command_status_label.config(text="无指令", foreground="gray")

        self.root.after(200, self.update_integrated_display)

    def _update_module_output(self, result: dict):
        """更新模块详细输出显示"""
        # 活体检测输出
        if self.integrated_system.living_detector:
            living_result = self.integrated_system.living_detector.get_status()
            if living_result:
                self.living_detection_count_label.config(text=str(living_result['detection_count']))
                self.living_sad_energy_label.config(text=f"{living_result['sad_energy']:.2f}")
                self.living_sad_score_label.config(text=f"{living_result['sad_score']:.3f}")
                self.living_threshold_label.config(text=f"{living_result['threshold']:.2f}")
            else:
                # 检测器运行中但尚未完成首次检测
                self.living_detection_count_label.config(text="0")
                self.living_sad_energy_label.config(text="收集中...")
                self.living_sad_score_label.config(text="收集中...")

        # 体型检测输出
        if self.integrated_system.body_type_detector:
            body_result = result.get('body_features')
            if body_result:
                cushion_features = body_result.get('cushion', {})
                backrest_features = body_result.get('backrest', {})

                self.body_cushion_original_sum_label.config(
                    text=f"{cushion_features.get('original_sum', 0.0):.1f}"
                )
                self.body_cushion_filtered_sum_label.config(
                    text=f"{cushion_features.get('filtered_sum', 0.0):.1f}"
                )
                self.body_backrest_filtered_sum_label.config(
                    text=f"{backrest_features.get('filtered_sum', 0.0):.1f}"
                )

            # 动态更新体型阈值显示（从配置中读取实际值）
            adult_threshold = self.integrated_system.body_type_detector.body_size_adult_threshold
            child_threshold = self.integrated_system.body_type_detector.body_size_child_threshold
            self.body_thresholds_label.config(
                text=f"大人>={adult_threshold:.0f}, 小孩>={child_threshold:.0f}"
            )

    def _update_control_decision_data(self, result: dict):
        """更新控制决策数据显示"""
        # 获取控制决策数据（如果存在）
        control_data = result.get('control_decision_data')
        if not control_data:
            return

        # 腰托控制数据
        lumbar_data = control_data.get('lumbar', {})
        self.lumbar_upper_pressure_label.config(text=f"{lumbar_data.get('upper_pressure', 0.0):.1f}")
        self.lumbar_lower_pressure_label.config(text=f"{lumbar_data.get('lower_pressure', 0.0):.1f}")
        self.lumbar_ratio_label.config(text=f"{lumbar_data.get('ratio', 0.0):.2f}")

        # 阈值检查
        threshold_passed = lumbar_data.get('threshold_passed', False)
        if threshold_passed:
            self.lumbar_threshold_check_label.config(text="已通过", foreground="green")
        else:
            self.lumbar_threshold_check_label.config(text="未通过", foreground="gray")

        # 决策
        lumbar_action = lumbar_data.get('action', 'HOLD')
        self.lumbar_decision_label.config(text=lumbar_action)
        if lumbar_action == 'INFLATE':
            self.lumbar_decision_label.config(foreground="green")
        elif lumbar_action == 'DEFLATE':
            self.lumbar_decision_label.config(foreground="red")
        else:
            self.lumbar_decision_label.config(foreground="gray")

        # 侧翼控制数据
        wing_data = control_data.get('side_wings', {})
        self.wing_left_pressure_label.config(text=f"{wing_data.get('left_pressure', 0.0):.1f}")
        self.wing_right_pressure_label.config(text=f"{wing_data.get('right_pressure', 0.0):.1f}")
        self.wing_ratio_label.config(text=f"{wing_data.get('ratio', 0.0):.2f}")

        # 左翼决策
        left_action = wing_data.get('left_action', 'HOLD')
        self.left_wing_decision_label.config(text=left_action)
        if left_action == 'INFLATE':
            self.left_wing_decision_label.config(foreground="green")
        elif left_action == 'DEFLATE':
            self.left_wing_decision_label.config(foreground="red")
        else:
            self.left_wing_decision_label.config(foreground="gray")

        # 右翼决策
        right_action = wing_data.get('right_action', 'HOLD')
        self.right_wing_decision_label.config(text=right_action)
        if right_action == 'INFLATE':
            self.right_wing_decision_label.config(foreground="green")
        elif right_action == 'DEFLATE':
            self.right_wing_decision_label.config(foreground="red")
        else:
            self.right_wing_decision_label.config(foreground="gray")

        # 腿托控制数据
        leg_data = control_data.get('leg_support', {})

        # 左腿托数据
        self.left_leg_pressure_label.config(text=f"{leg_data.get('left_leg_pressure', 0.0):.1f}")
        self.left_butt_pressure_label.config(text=f"{leg_data.get('left_butt_pressure', 0.0):.1f}")
        self.left_leg_ratio_label.config(text=f"{leg_data.get('left_ratio', 0.0):.2f}")

        # 左腿托决策
        left_leg_action = leg_data.get('left_action', 'HOLD')
        self.left_leg_decision_label.config(text=left_leg_action)
        if left_leg_action == 'INFLATE':
            self.left_leg_decision_label.config(foreground="green")
        elif left_leg_action == 'DEFLATE':
            self.left_leg_decision_label.config(foreground="red")
        else:
            self.left_leg_decision_label.config(foreground="gray")

        # 右腿托数据
        self.right_leg_pressure_label.config(text=f"{leg_data.get('right_leg_pressure', 0.0):.1f}")
        self.right_butt_pressure_label.config(text=f"{leg_data.get('right_butt_pressure', 0.0):.1f}")
        self.right_leg_ratio_label.config(text=f"{leg_data.get('right_ratio', 0.0):.2f}")

        # 右腿托决策
        right_leg_action = leg_data.get('right_action', 'HOLD')
        self.right_leg_decision_label.config(text=right_leg_action)
        if right_leg_action == 'INFLATE':
            self.right_leg_decision_label.config(foreground="green")
        elif right_leg_action == 'DEFLATE':
            self.right_leg_decision_label.config(foreground="red")
        else:
            self.right_leg_decision_label.config(foreground="gray")

    def _update_command_status(self, command: list[int] | None, cmd_info: dict = None):
        """更新控制指令状态

        Args:
            command: list[int] | None - 55个10进制整数的列表，或None
                协议格式: [帧头, 气囊数据×48, 模式, 方向, 帧尾×4]
            cmd_info: dict | None - 指令附加信息（来自队列）
                - 'frame_count': int - 生成该指令时的帧计数
                - 'command_count': int - 指令序号
                - 'state': str - 生成该指令时的状态
        """
        if not command:
            return

        # 解析指令中的气囊（包括保持）
        active_airbags = []
        for i in range(24):
            airbag_id = command[1 + i * 2]
            gear = command[1 + i * 2 + 1]

            if gear == 0x03:
                active_airbags.append(f"{airbag_id}充")
            elif gear == 0x04:
                active_airbags.append(f"{airbag_id}放")
            elif gear == 0x00:
                # 保持指令也显示（用于非锁定状态）
                if airbag_id in [1, 2, 3, 4, 5, 6, 9, 10]:
                    active_airbags.append(f"{airbag_id}保持")

        # 更新状态
        self.command_status_label.config(text="已发送", foreground="green")
        self.command_count_label.config(text=str(self.command_count))

        if active_airbags:
            # 只显示有动作的气囊（充气/放气），如果都是保持则显示"保持"
            action_airbags = [ab for ab in active_airbags if "保持" not in ab]
            if action_airbags:
                cmd_text = ", ".join(action_airbags[:6])
                if len(action_airbags) > 6:
                    cmd_text += "..."
            else:
                cmd_text = "全部保持"
            self.last_command_label.config(text=cmd_text)
        else:
            self.last_command_label.config(text="保持")

        # 后台打印控制指令（使用队列中的原始帧号和指令序号）
        if cmd_info:
            orig_frame = cmd_info.get('frame_count', self.frame_count)
            orig_cmd_count = cmd_info.get('command_count', self.command_count)
            state = cmd_info.get('state', 'UNKNOWN')
            print(f"\n[Visualizer] 帧{orig_frame} | 系统指令#{orig_cmd_count} | 状态={state} | GUI指令#{self.command_count}")
        else:
            print(f"\n[Visualizer] 帧{self.frame_count} | GUI指令#{self.command_count}")
        print(f"  → 指令长度: {len(command)} 元素")
        if active_airbags:
            print(f"  → 动作气囊: {', '.join(active_airbags)}")
        else:
            print(f"  → 所有气囊保持状态")

    def _update_airbag_display_from_command(self, command: list[int] | None):
        """根据控制指令更新气囊状态显示

        Args:
            command: list[int] | None - 55个10进制整数的列表
                协议帧格式:
                - [0]: 帧头 (0x1F = 31)
                - [1-48]: 24个气囊 × 2字节 (气囊ID, 档位)
                - [49]: 工作模式 (0x00=自动)
                - [50]: 方向标识 (0x00=下发)
                - [51-54]: 帧尾 [170, 85, 3, 153]
        """
        if not command or len(command) != 55:
            return

        # 解析协议帧：55字节
        # 字节0: 帧头 0x1F
        # 字节1-48: 24个气囊 × 2字节 (气囊ID, 档位)
        # 字节49: 工作模式
        # 字节50: 方向标识
        # 字节51-54: 帧尾

        # 遍历需要显示的气囊
        for airbag_id in self.airbag_labels:
            name = self.airbag_names[airbag_id]

            # 计算该气囊在协议帧中的位置
            # 气囊N的档位在: 字节[1 + (N-1)*2 + 1] = 字节[2*N]
            gear_index = 2 * airbag_id
            gear = command[gear_index]

            # 根据档位更新显示
            if gear == 0x03:  # 充气
                status_text = f"{airbag_id}:{name} [充气]"
                color = "green"
            elif gear == 0x04:  # 放气
                status_text = f"{airbag_id}:{name} [放气]"
                color = "red"
            else:  # 0x00 或其他 = 保持
                status_text = f"{airbag_id}:{name} [保持]"
                color = "gray"

            self.airbag_labels[airbag_id].config(text=status_text, foreground=color)

    def _reset_airbag_status(self):
        """重置气囊状态显示"""
        for airbag_id, label in self.airbag_labels.items():
            name = self.airbag_names[airbag_id]
            label.config(text=f"{airbag_id}:{name} [保持]", foreground="gray")

    def on_closing(self):
        """窗口关闭事件"""
        self._disconnect()
        self.root.destroy()


def main():
    """主函数"""
    root = tk.Tk()
    app = SensorVisualizer(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    root.mainloop()


if __name__ == '__main__':
    main()
