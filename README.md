# N100 OpenWrt

适用：N100、8GB 内存、20GB 硬盘、四网口，直接安装。基于 OpenWrt 25.12 稳定系列；包含 SSR Plus+、OpenClash、mihomo、中文界面与常见 Intel/Realtek 网卡驱动。第三方插件固定到 prepare.sh 中的提交，避免每周未经验证地改变插件代码。

## 网络

- eth0 = WAN，DHCP 从光猫获取地址。
- eth1/eth2/eth3 = LAN，管理地址 192.168.10.1。
- 实际外壳端口编号与 eth 编号需要上机核对；并检查光猫网段是否冲突。
- 代理默认关闭，安装后自行添加订阅或节点，只启用一套透明代理。
- 首次登录后立即设置管理员密码。没有写入任何密码或订阅。

## 编译

Ubuntu 24.04，使用普通用户。先安装 workflow 中列出的依赖。

```bash
git clone --depth 1 --branch v25.12.6 https://github.com/openwrt/openwrt.git source
bash prepare.sh "$PWD/source"
echo 'n100-25.12.6-local-1' > source/files/etc/n100-build-id
make -C source download -j8
make -C source -j8 V=s
```

产物在 source/bin/targets/x86/64。EFI 机器使用 squashfs-combined-efi.img.gz，传统 BIOS 使用 squashfs-combined.img.gz。首次写盘会覆盖目标磁盘。此方案固定根分区为 2048MiB，其余磁盘未自动分配，避免分区扩容后升级布局不一致。

## GitHub 自动更新

仓库：nzero1988/n100-openwrt。Actions 每周五北京时间 12:17 编译，并支持手动触发和提交触发。仅选择 25.12 系列正式 tag，成功后发布 Release。GitHub 可能延迟定时任务；长期无活动的公开仓库计划任务可能被停用，需留意 Actions 状态。

路由器每周日北京时间 04:00 获取最新 Release，有不同构建时下载匹配 BIOS/EFI 的镜像，检查 HTTPS 来源、SHA256、目标、布局、空间和 sysupgrade 测试，再备份配置并执行升级。无更新不会重启，检查失败会终止。SHA256 用于完整性检查，信任边界仍是 GitHub 仓库及其发布权限，未实现独立离线签名。

本机未连接 N100，尚未完成硬件启动、端口映射、插件运行与实际保留配置升级验证。编译成功不等于通过这些检查。当前没有 A/B 分区或启动失败自动回滚；配置备份不是固件回滚方案。

```sh
# 仅检查、下载、校验，不刷写
n100-update --check
# 查看升级记录
logread -e n100-update
# 暂停自动升级
uci set n100-update.main.enabled='0'
uci commit n100-update
```

路由器需要直接或通过已运行的代理访问 api.github.com 和 GitHub Release 下载域名。无法访问时跳过升级。SS/SSR 订阅和规则的更新与系统固件更新独立配置。
